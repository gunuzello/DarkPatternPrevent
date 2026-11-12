import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import { buildPriceLedger } from "./price-ledger";
import { isProductPage, productPath } from "./public-scan";
import { explorePurchaseJourney } from "./purchase-journey";
import { observePaidOptionChanges } from "./journey-evidence";
import { capture } from "./scan";
import { scanComparisonVersion } from "./scan-comparison";
import { detect, type InteractionEvidence, type Snapshot } from "./rules";

const rootHost = (hostname: string) => hostname.replace(/^www\./, "");

export async function scanDynamicPublicShop(
  browser: Browser,
  targetUrl: string,
  directory: string,
  proxyServer: string,
  onStage: (snapshot: Snapshot) => Promise<void>,
) {
  const target = new URL(targetUrl);
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({
    proxy: { server: proxyServer }, serviceWorkers: "block", acceptDownloads: false,
    locale: "ko-KR", timezoneId: "Asia/Seoul", viewport: { width: 1440, height: 1000 },
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

    if (!await isProductPage(page, page.url())) {
      const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.slice(0, 300).map((item) => item.getAttribute("href") ?? ""));
      const candidates = new Set<string>();
      for (const href of links) {
        let candidate: URL;
        try { candidate = new URL(href, page.url()); } catch { continue; }
        if (candidate.protocol !== "https:" || candidate.origin !== target.origin || !productPath.test(candidate.pathname)) continue;
        candidates.add(candidate.href);
        if (candidates.size === 3) break;
      }
      let found = false;
      for (const candidate of candidates) {
        const next = await page.goto(candidate, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
        if (next?.ok() && await isProductPage(page, page.url())) { found = true; break; }
      }
      if (!found) throw new Error("동적으로 검사할 상품 상세 화면을 찾지 못했습니다.");
    }

    await mkdir(directory, { recursive: true });
    const snapshots: Snapshot[] = [];
    const interactions: InteractionEvidence[] = [];
    const journey = await explorePurchaseJourney(page, async (stage) => {
      const snapshot = await capture(page, stage, directory, page.locator("body"), page.url(), true);
      snapshots.push(snapshot);
      if (stage === "product") interactions.push(...await observePaidOptionChanges(page, page.locator("body"), stage));
      await onStage(snapshot);
    });
    interactions.push(...journey.observations.map(({ action }) => action));
    const report = {
      comparisonVersion: scanComparisonVersion,
      scanStatus: journey.reached === "checkout" ? "COMPLETED" as const : "PARTIAL" as const,
      executionMode: "DYNAMIC" as const, scenario: "public" as const, targetUrl, snapshots, interactions,
      networkPriceEvidence: journey.network,
      priceLedger: buildPriceLedger(snapshots, journey.network), findings: detect(snapshots),
    };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await context.close();
  }
}
