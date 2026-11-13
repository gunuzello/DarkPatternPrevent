import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import { buildPriceLedger, type FirstPriceExposure } from "./price-ledger";
import { isProductPage, productPath } from "./public-scan";
import { explorePurchaseJourney } from "./purchase-journey";
import { observePaidOptionChanges } from "./journey-evidence";
import { capture } from "./scan";
import { scanComparisonVersion } from "./scan-comparison";
import { detect, type InteractionEvidence, type Snapshot } from "./rules";
import { feeMentionsFromText } from "./price-text";
import { collectReviewCandidates } from "./review-candidates";

const rootHost = (hostname: string) => hostname.replace(/^www\./, "");

export async function scanDynamicPublicShop(
  browser: Browser,
  targetUrl: string,
  directory: string,
  proxyServer: string,
  viewport: "DESKTOP" | "MOBILE",
  onStage: (snapshot: Snapshot) => Promise<void>,
  purchasePath: "CART" | "DIRECT" = "CART",
) {
  const target = new URL(targetUrl);
  await mkdir(directory, { recursive: true });
  const mobile = viewport === "MOBILE";
  const context = await browser.newContext({
    proxy: { server: proxyServer }, serviceWorkers: "block", acceptDownloads: false,
    locale: "ko-KR", timezoneId: "Asia/Seoul",
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
  });
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      let url: URL;
      try { url = new URL(request.url()); } catch { await route.abort(); return; }
      if (["data:", "blob:"].includes(url.protocol)) { await route.continue(); return; }
      if (url.protocol !== "https:" || request.isNavigationRequest() && rootHost(url.hostname) !== rootHost(target.hostname)) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 20_000 });
    if (!response?.ok()) throw new Error("쇼핑몰 첫 화면을 불러오지 못했습니다.");
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    let firstPriceExposure: FirstPriceExposure | undefined;
    if (!await isProductPage(page, page.url())) {
      const listingUrl = page.url();
      const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.slice(0, 300).map((item) => ({
        href: item.getAttribute("href") ?? "",
        context: (item.closest("article, li, [class*='product' i], [class*='item' i]") ?? item).textContent?.replace(/\s+/g, " ").trim().slice(0, 500) ?? "",
      })));
      const candidates = new Set<string>();
      const contexts = new Map<string, string>();
      for (const { href, context } of links) {
        let candidate: URL;
        try { candidate = new URL(href, page.url()); } catch { continue; }
        if (candidate.protocol !== "https:" || rootHost(candidate.hostname) !== rootHost(target.hostname) || !productPath.test(candidate.pathname)) continue;
        candidates.add(candidate.href);
        if (!contexts.has(candidate.href)) contexts.set(candidate.href, context);
        if (candidates.size === 3) break;
      }
      const listingScreenshot = "listing.png";
      await page.screenshot({ path: join(directory, listingScreenshot), fullPage: false, scale: "css" });
      const listingCapturedAt = new Date().toISOString();
      let found = false;
      for (const candidate of candidates) {
        const next = await page.goto(candidate, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
        if (next?.ok() && await isProductPage(page, page.url())) {
          const text = contexts.get(candidate) ?? "";
          const observedAmounts = [...text.matchAll(/(?:₩\s*)?(\d[\d,]*)\s*원/g)]
            .map((match) => Number(match[1].replaceAll(",", ""))).filter((amount) => Number.isFinite(amount) && amount > 0);
          if (observedAmounts.length) firstPriceExposure = {
            status: "OBSERVED", url: listingUrl, productUrl: page.url(), text,
            amounts: [...new Set(observedAmounts)], feeMentions: feeMentionsFromText(text),
            screenshot: listingScreenshot, capturedAt: listingCapturedAt,
          };
          found = true;
          break;
        }
      }
      if (!found) {
        // A client-rendered storefront may expose product cards as buttons with
        // no detail URL. Preserve the rendered listing as the product-stage
        // evidence instead of failing the whole scan; journey exploration will
        // report an explicit ambiguous/missing action without guessing a SKU.
        const listingText = await page.locator("body").innerText().catch(() => "");
        const purchaseButtons = page.getByRole("button", { name: /(?:구매|장바구니|담기|buy|cart|add)/i });
        if (/(?:[₩$£€]\s*\d[\d,.]*|\d[\d,.]*\s*원)/.test(listingText) && await purchaseButtons.count() > 0) {
          const observedAmounts = [...listingText.matchAll(/(?:₩\s*)?(\d[\d,]*)\s*원/g)]
            .map((match) => Number(match[1].replaceAll(",", ""))).filter((amount) => Number.isFinite(amount) && amount > 0);
          firstPriceExposure = {
            status: "OBSERVED", url: listingUrl, productUrl: listingUrl, text: listingText.slice(0, 2_000),
            amounts: [...new Set(observedAmounts)].slice(0, 20), feeMentions: feeMentionsFromText(listingText),
            screenshot: listingScreenshot, capturedAt: listingCapturedAt,
          };
        } else {
          throw new Error("동적으로 검사할 상품 상세 화면을 찾지 못했습니다.");
        }
      }
    }

    await mkdir(directory, { recursive: true });
    const snapshots: Snapshot[] = [];
    const interactions: InteractionEvidence[] = [];
    const journey = await explorePurchaseJourney(page, async (stage) => {
      const snapshot = await capture(page, stage, directory, page.locator("body"), page.url(), true);
      snapshots.push(snapshot);
      if (stage === "product") interactions.push(...await observePaidOptionChanges(page, page.locator("body"), stage));
      await onStage(snapshot);
    }, purchasePath);
    interactions.push(...journey.observations.map(({ action }) => action));
    const report = {
      comparisonVersion: scanComparisonVersion,
      scanStatus: journey.reached === "checkout" ? "COMPLETED" as const : "PARTIAL" as const,
      executionMode: "DYNAMIC" as const, viewport, purchasePath, scenario: "public" as const, targetUrl, snapshots, interactions,
      explorationBlocker: journey.blocker ?? null,
      networkPriceEvidence: journey.network,
      priceLedger: buildPriceLedger(snapshots, journey.network, firstPriceExposure),
      reviewCandidates: collectReviewCandidates(snapshots),
      findings: detect(snapshots, firstPriceExposure?.feeMentions),
    };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await context.close();
  }
}
