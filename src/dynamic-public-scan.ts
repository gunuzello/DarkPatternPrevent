import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import { buildPriceLedger, type FirstPriceExposure } from "./price-ledger";
import { isProductPage } from "./public-scan";
import { explorePurchaseJourney } from "./purchase-journey";
import { observePaidOptionChanges } from "./journey-evidence";
import { capture } from "./scan";
import { scanComparisonVersion } from "./scan-comparison";
import { detect, type InteractionEvidence, type Snapshot } from "./rules";
import { feeMentionsFromText } from "./price-text";
import { collectReviewCandidates, collectSurfaceReviewCandidates } from "./review-candidates";
import { structuredProductLinks } from "./structured-product-links";
import type { TestCredentials } from "./credential-vault";
import { classifyDynamicFailure } from "./scan-failure";
import { summarizeAiUsage } from "./ai-cost";

const rootHost = (hostname: string) => hostname.replace(/^www\./, "");

export function isAllowedDynamicRequest(targetUrl: string, requestUrl: string) {
  try {
    const target = new URL(targetUrl);
    const request = new URL(requestUrl);
    return ["data:", "blob:"].includes(request.protocol) ||
      (request.protocol === "https:" && rootHost(request.hostname) === rootHost(target.hostname));
  } catch {
    return false;
  }
}

export async function scanDynamicPublicShop(
  browser: Browser,
  targetUrl: string,
  directory: string,
  proxyServer: string,
  viewport: "DESKTOP" | "MOBILE",
  onStage: (snapshot: Snapshot) => Promise<void>,
  purchasePath: "CART" | "DIRECT" = "CART",
  credentials?: TestCredentials,
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
      // Keep the dynamic session inside the verified storefront origin. A
      // third-party asset is not evidence-critical and must not expand the
      // requested scan's network boundary or receive session state.
      if (!isAllowedDynamicRequest(target.href, url.href)) {
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
    if (credentials) {
      // Many storefronts keep the login form inside a modal that is opened
      // only after the header action is clicked. Open one unambiguous login
      // control before looking for the credential fields; do not click
      // marketing/consent controls or guess among multiple candidates.
      if (!await page.locator('input[type="password"]:visible').count()) {
        const loginControl = page.getByRole("button", { name: /로그인|sign\s*in|log\s*in/i })
          .or(page.getByRole("link", { name: /로그인|sign\s*in|log\s*in/i }));
        if (await loginControl.count() === 1) {
          await loginControl.click();
          await page.waitForTimeout(250);
        }
      }
    }
    if (credentials && await page.locator('input[type="password"]:visible').count()) {
      const password = page.locator('input[type="password"]:visible').first();
      const userField = page.locator('input[type="email"], input[name*="id" i], input[name*="user" i], input[name*="login" i], input[autocomplete="username"]').filter({ visible: true }).first();
      if (!await userField.count()) throw new Error("로그인 아이디 입력란을 찾지 못했습니다.");
      await userField.fill(credentials.username);
      await password.fill(credentials.password);
      // The header login trigger often remains in the DOM while the modal is
      // open. Restrict submission to visible controls so we do not click the
      // trigger a second time or reject an otherwise unambiguous form.
      let submit = page.locator('form:visible button[type="submit"], form:visible input[type="submit"], button[type="submit"]:visible, input[type="submit"]:visible');
      if (await submit.count() === 0) {
        submit = page.locator('button:visible').filter({ hasText: /로그인|sign\s*in|log\s*in/i });
      }
      if (await submit.count() !== 1) throw new Error("로그인 버튼을 하나로 확정하지 못했습니다.");
      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {}),
        submit.click(),
      ]);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      if (await page.locator('input[type="password"]:visible').count()) throw new Error("로그인에 실패했거나 추가 인증이 필요합니다.");
    }

    let firstPriceExposure: FirstPriceExposure | undefined;
    if (!await isProductPage(page, page.url())) {
      const listingUrl = page.url();
      const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.slice(0, 300).map((item) => ({
        href: item.getAttribute("href") ?? "",
        context: (item.closest("article, li, [class*='product' i], [class*='item' i]") ?? item).textContent?.replace(/\s+/g, " ").trim().slice(0, 500) ?? "",
      })));
      const structuredLinks = structuredProductLinks(await page.locator('script[type="application/ld+json"]').allTextContents());
      const metadataLinks = await page.locator('link[rel="canonical"][href], meta[property="og:url"][content]').evaluateAll((nodes) => nodes.flatMap((node) => {
        const href = node.getAttribute("href") ?? node.getAttribute("content") ?? "";
        return href ? [{ href, context: "표준 상품 메타데이터" }] : [];
      }));
      const candidates = new Set<string>();
      const contexts = new Map<string, string>();
      for (const { href, context } of [...links, ...structuredLinks, ...metadataLinks]) {
        let candidate: URL;
        try { candidate = new URL(href, page.url()); } catch { continue; }
        if (candidate.protocol !== "https:" || rootHost(candidate.hostname) !== rootHost(target.hostname) ||
            /(?:^|\/)(?:search|search\.html)(?:\/|$)/i.test(candidate.pathname) ||
            [...candidate.searchParams.keys()].some((key) => /^(?:q|query|keyword|search|action|add-to-cart|redirect|return_url)$/i.test(key))) continue;
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
        const actionPattern = /(?:구매|장바구니|카트|담기|buy|cart|bag|add)/i;
        const purchaseActions = page.getByRole("button", { name: actionPattern })
          .or(page.getByRole("link", { name: actionPattern }));
        const inputActions = page.locator('input[type="submit"], input[type="button"]');
        const inputCount = await inputActions.evaluateAll((items, source) => items.filter((item) => {
          if (!(item as HTMLElement).checkVisibility()) return false;
          return new RegExp(source as string, "i").test(`${(item as HTMLInputElement).value} ${item.getAttribute("aria-label") ?? ""}`);
        }).length, actionPattern.source);
        if (/(?:[₩$£€]\s*\d[\d,.]*|\d[\d,.]*\s*원)/.test(listingText) &&
            (await purchaseActions.count() + inputCount > 0)) {
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
    const journeyTimeoutMs = Math.min(Math.max(Number(process.env.DYNAMIC_JOURNEY_TIMEOUT_MS ?? 120_000), 20_000), 300_000);
    let journeyFailure: string | null = null;
    let journeyTimer: ReturnType<typeof setTimeout> | undefined;
    const journeyPromise = explorePurchaseJourney(page, async (stage) => {
      const snapshot = await capture(page, stage, directory, page.locator("body"), page.url(), true);
      snapshots.push(snapshot);
      if (stage === "product") interactions.push(...await observePaidOptionChanges(page, page.locator("body"), stage));
      await onStage(snapshot);
    }, purchasePath);
    const journey = await Promise.race([
      journeyPromise,
      new Promise<never>((_, reject) => { journeyTimer = setTimeout(() => reject(new Error(`동적 구매 흐름 시간 초과(${journeyTimeoutMs}ms)`)), journeyTimeoutMs); }),
    ]).catch((error: unknown) => {
      journeyFailure = error instanceof Error ? error.message : "동적 구매 흐름이 제한 시간 안에 끝나지 않았습니다.";
      return { observations: [], network: [], surfaceDestinations: [], surfaceObservations: [], reached: "product" as const, blocker: { stage: "product" as const, code: "ACTION_FAILED" as const, action: purchasePath === "DIRECT" ? "DIRECT_BUY" as const : "ADD_TO_CART" as const, candidateCount: 0 } };
    });
    if (journeyTimer) clearTimeout(journeyTimer);
    interactions.push(...journey.observations.map(({ action }) => action));
    const report = {
      comparisonVersion: scanComparisonVersion,
      scanStatus: journey.reached === "checkout" ? "COMPLETED" as const : "PARTIAL" as const,
      executionMode: "DYNAMIC" as const, viewport, purchasePath, scenario: "public" as const, targetUrl, snapshots, interactions,
      explorationBlocker: journey.blocker ?? null,
      surfaceDestinations: journey.surfaceDestinations,
      surfaceObservations: journey.surfaceObservations,
      networkPriceEvidence: journey.network,
      priceLedger: buildPriceLedger(snapshots, journey.network, firstPriceExposure),
      reviewCandidates: [...collectReviewCandidates(snapshots), ...collectSurfaceReviewCandidates(journey.surfaceObservations)],
      aiUsage: summarizeAiUsage([]),
      findings: detect(snapshots, firstPriceExposure?.feeMentions), collectionFailure: journeyFailure, collectionFailureCode: journeyFailure ? classifyDynamicFailure(journeyFailure) : null,
    };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await context.close();
  }
}
