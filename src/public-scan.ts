import { scanComparisonVersion } from "./scan-comparison";
import { buildPriceLedger, type FirstPriceExposure } from "./price-ledger";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { fetchPublicHtml } from "./public-html";
import { capture } from "./scan";
import { detect, type Snapshot } from "./rules";
import { publicShopUrl } from "./targets";
import { feeMentionsFromText } from "./price-text";
import { startSafeBrowserProxy } from "./safe-browser-proxy";
import { collectReviewCandidates } from "./review-candidates";
import { structuredProductLinks } from "./structured-product-links";

export const productPath = /\/(?:products?\/(?!(?:list|search)\.(?:html|php)(?:$|\/)|category\/)[^/]+|goods\/[^/]+|items?\/[^/]+|shopdetail(?:\/[^/]+|\.html)|catalogue\/[^/]+_\d+\/index\.html)/i;
const addToCart = /^(?:장바구니(?:에 담기)?|add to (?:cart|bag|basket))$/i;
const buyNow = /^(?:바로 구매|구매하기|buy now)$/i;

export async function isProductPage(page: Page, url: string) {
  const schema = await page.locator('[itemtype$="/Product"], script[type="application/ld+json"]').evaluateAll((nodes) =>
    nodes.some((node) => node.hasAttribute("itemtype") || /"@type"\s*:\s*"Product"/i.test(node.textContent ?? "")));
  if (schema) return true;
  if (await page.locator('meta[property="og:type"][content="product" i]').count() &&
      await page.locator('meta[property="product:price:amount"][content]').count()) return true;
  for (const name of [addToCart, buyNow]) {
    const actions = page.getByRole("button", { name }).or(page.getByRole("link", { name }));
    if (await actions.count() === 1) return true;
  }
  // Do not require a platform-specific URL shape. Many storefronts use opaque
  // slugs, query-backed routes, or client-side history URLs for product pages.
  // The fallback therefore relies on the page's semantic signals instead.
  if (await page.getByRole("heading", { level: 1 }).count() !== 1) return false;
  const text = await page.locator("body").innerText();
  return /(?:[₩$£€]\s*\d|\d[\d,.]*\s*원)/.test(text) &&
    (await page.getByRole("button", { name: /(?:구매|장바구니|담기|buy|cart|add)/i }).count() > 0 ||
      await page.getByRole("link", { name: /(?:구매|장바구니|담기|buy|cart|add)/i }).count() > 0);
}

export async function scanPublicShop(
  browser: Browser, targetUrl: string, directory: string,
  onStage: (snapshot: Snapshot) => Promise<void>,
  load = fetchPublicHtml,
  viewport: "DESKTOP" | "MOBILE" = "DESKTOP",
  purchasePath: "CART" | "DIRECT" = "CART",
) {
  const mobile = viewport === "MOBILE";
  const context = await browser.newContext({
    offline: true, javaScriptEnabled: false, serviceWorkers: "block", acceptDownloads: false,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
  });
  try {
    await mkdir(directory, { recursive: true });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const render = (html: string) => page.setContent(
      `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">` + html,
      { waitUntil: "domcontentloaded" },
    );
    const partial = async (reason: string) => {
      const report = {
        comparisonVersion: scanComparisonVersion,
        scanStatus: "PARTIAL" as const, executionMode: "STATIC" as const, viewport, purchasePath,
        scenario: "public" as const, targetUrl, snapshots: [], priceLedger: buildPriceLedger([]), findings: [], reviewCandidates: [],
        collectionFailure: reason,
      };
      await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
      return report;
    };
    let document;
    try {
      document = await load(targetUrl);
    } catch {
      return partial("첫 화면을 불러오지 못했습니다. 공개 HTTPS 상품 URL과 접근 가능 여부를 확인해 주세요.");
    }
    await render(document.html);
    let firstPriceExposure: FirstPriceExposure | undefined;
    if (!await isProductPage(page, document.url)) {
      const origin = new URL(document.url).origin;
      const listingUrl = document.url;
      const links = await page.locator("a[href]").evaluateAll((anchors) => anchors
        .filter((anchor) => anchor.checkVisibility()).slice(0, 250).map((anchor) => ({
          href: anchor.getAttribute("href") ?? "",
          context: (anchor.closest("article, li, [class*='product' i], [class*='item' i]") ?? anchor).textContent?.replace(/\s+/g, " ").trim().slice(0, 500) ?? "",
        })));
      const structuredLinks = structuredProductLinks(await page.locator('script[type="application/ld+json"]').allTextContents());
      const candidates = new Set<string>();
      const contexts = new Map<string, string>();
      for (const { href, context } of [...links, ...structuredLinks]) {
        let url: URL | null;
        try { url = publicShopUrl(new URL(href, document.url).href); } catch { continue; }
        if (!url || url.origin !== origin || url.href === document.url ||
            /(?:^|\/)(?:search|search\.html)(?:\/|$)/i.test(url.pathname) ||
            [...url.searchParams.keys()].some((key) => /^(?:q|query|keyword|search)$/i.test(key)) ||
            [...url.searchParams.keys()].some((key) => /^(?:action|add-to-cart|redirect|return_url)$/i.test(key))) continue;
        candidates.add(url.href);
        if (!contexts.has(url.href)) contexts.set(url.href, context);
        if (candidates.size === 3) break;
      }
      const listingScreenshot = "listing.png";
      await page.screenshot({ path: join(directory, listingScreenshot), fullPage: false, scale: "css" });
      const listingCapturedAt = new Date().toISOString();
      let found = false;
      for (const candidate of candidates) {
        const next = await load(candidate).catch(() => null);
        if (!next) continue;
        await render(next.html);
        if (!await isProductPage(page, next.url)) continue;
        document = next;
        const text = contexts.get(candidate) ?? "";
        const observedAmounts = [...text.matchAll(/(?:₩\s*)?(\d[\d,]*)\s*원/g)]
          .map((match) => Number(match[1].replaceAll(",", ""))).filter((amount) => Number.isFinite(amount) && amount > 0);
        if (observedAmounts.length) firstPriceExposure = {
          status: "OBSERVED", url: listingUrl, productUrl: next.url, text,
          amounts: [...new Set(observedAmounts)], feeMentions: feeMentionsFromText(text),
          screenshot: listingScreenshot, capturedAt: listingCapturedAt,
        };
        found = true;
        break;
      }
      if (!found) {
        // Many modern storefronts are client-rendered and expose product cards as
        // buttons rather than links. Use a same-origin rendered pass as a generic
        // fallback; this is still a public, non-interactive inspection and does
        // not submit forms or enter a purchase flow.
        const renderedProxy = await startSafeBrowserProxy().catch(() => null);
        if (!renderedProxy) return partial("동적 화면 폴백을 위한 안전 연결을 시작하지 못했습니다. 공개 HTML 또는 상품 상세 URL을 확인해 주세요.");
        const rendered = await browser.newContext({
          proxy: { server: renderedProxy.server }, javaScriptEnabled: true, serviceWorkers: "block", acceptDownloads: false,
          viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
          isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
        });
        try {
          const renderedPage = await rendered.newPage();
          renderedPage.setDefaultTimeout(8000);
          const origin = new URL(document.url).origin;
          await rendered.route("**/*", (route) => {
            try {
              const requestUrl = new URL(route.request().url());
              if (requestUrl.origin === origin || requestUrl.protocol === "data:") return route.continue();
            } catch { /* abort malformed requests */ }
            return route.abort();
          });
          await renderedPage.goto(document.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
          await renderedPage.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
          const bodyText = await renderedPage.locator("body").innerText().catch(() => "");
          const actionPattern = /(?:구매|장바구니|카트|담기|buy|cart|bag|add)/i;
          const purchaseActions = renderedPage.getByRole("button", { name: actionPattern })
            .or(renderedPage.getByRole("link", { name: actionPattern }));
          const inputActions = renderedPage.locator('input[type="submit"], input[type="button"]');
          const inputCount = await inputActions.evaluateAll((items, source) => items.filter((item) => {
            if (!(item as HTMLElement).checkVisibility()) return false;
            const text = `${(item as HTMLInputElement).value} ${item.getAttribute("aria-label") ?? ""}`;
            return new RegExp(source as string, "i").test(text);
          }).length, actionPattern.source);
          const hasProductSignal = /(?:[₩$£€]\s*\d|\d[\d,.]*\s*원)/.test(bodyText) &&
            (await purchaseActions.count() + inputCount > 0);
          if (hasProductSignal) {
            document = { url: renderedPage.url(), html: await renderedPage.content() };
            const product = await capture(renderedPage, "product", directory, renderedPage.locator("body"), renderedPage.url(), false);
            await onStage(product);
            const report = {
              comparisonVersion: scanComparisonVersion,
              scanStatus: "PARTIAL" as const, executionMode: "STATIC" as const, viewport, purchasePath,
              scenario: "public" as const, targetUrl, snapshots: [product],
              priceLedger: buildPriceLedger([product], [], firstPriceExposure), findings: detect([product]), reviewCandidates: collectReviewCandidates([product]), collectionFailure: null,
            };
            await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
            return report;
          }
        } catch { /* fall through to an explicit partial result */ }
        finally {
          await Promise.race([rendered.close(), new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
          await Promise.race([renderedProxy.close(), new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
        }
      }
      if (!found) return partial("상품 상세 화면을 찾지 못했습니다. 상품 상세 URL을 직접 입력해 주세요.");
    }

    await page.locator("body").waitFor({ state: "visible" });
    const product = await capture(page, "product", directory, page.locator("body"), document.url, false);
    await onStage(product);
    const report = {
      comparisonVersion: scanComparisonVersion,
      scanStatus: "PARTIAL" as const, executionMode: "STATIC" as const, viewport, purchasePath,
      scenario: "public" as const, targetUrl,
      snapshots: [product], priceLedger: buildPriceLedger([product], [], firstPriceExposure), findings: detect([product]), reviewCandidates: collectReviewCandidates([product]), collectionFailure: null,
    };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await context.close();
  }
}
