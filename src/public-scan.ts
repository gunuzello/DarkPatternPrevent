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
  if (!productPath.test(new URL(url).pathname) || await page.getByRole("heading", { level: 1 }).count() !== 1) return false;
  const text = await page.locator("body").innerText();
  return /(?:[₩$£€]\s*\d|\d[\d,.]*\s*원)/.test(text);
}

export async function scanPublicShop(
  browser: Browser, targetUrl: string, directory: string,
  onStage: (snapshot: Snapshot) => Promise<void>,
  load = fetchPublicHtml,
) {
  const context = await browser.newContext({ offline: true, javaScriptEnabled: false, serviceWorkers: "block", acceptDownloads: false });
  try {
    await mkdir(directory, { recursive: true });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const render = (html: string) => page.setContent(
      `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">` + html,
      { waitUntil: "domcontentloaded" },
    );
    let document = await load(targetUrl);
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
      const candidates = new Set<string>();
      const contexts = new Map<string, string>();
      for (const { href, context } of links) {
        let url: URL | null;
        try { url = publicShopUrl(new URL(href, document.url).href); } catch { continue; }
        if (!url || url.origin !== origin || url.href === document.url || !productPath.test(url.pathname) ||
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
      if (!found) throw new Error("상품 상세 화면을 찾지 못했습니다. 상품 상세 URL을 입력해 주세요.");
    }

    await page.locator("body").waitFor({ state: "visible" });
    const product = await capture(page, "product", directory, page.locator("body"), document.url, false);
    await onStage(product);
    const report = {
      comparisonVersion: scanComparisonVersion,
      scanStatus: "PARTIAL" as const, executionMode: "STATIC" as const, scenario: "public" as const, targetUrl,
      snapshots: [product], priceLedger: buildPriceLedger([product], [], firstPriceExposure), findings: detect([product]),
    };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await context.close();
  }
}
