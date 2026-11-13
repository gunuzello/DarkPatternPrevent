import { scanComparisonVersion } from "./scan-comparison";
import { buildPriceLedger } from "./price-ledger";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Locator, Page } from "playwright";
import { stages, type Scenario, type Stage } from "./demo";
import { mandatoryFeeFromText, paidOptionFromText } from "./price-text";
import { detect, type Snapshot } from "./rules";
import { observePaidOptionChanges } from "./journey-evidence";

export async function capture(page: Page, stage: Stage, directory: string, main: Locator, url = page.url(), fullPage = true): Promise<Snapshot> {
  await main.waitFor({ state: "visible" });

  const optionSelector = [
    'input:is([type="checkbox"], [type="radio"])',
    'select',
    '[role="switch"]',
  ].join(", ");
  const optionControls = await main.locator(optionSelector).evaluateAll((nodes) =>
    nodes.filter((node) => node.checkVisibility({ opacityProperty: true, visibilityProperty: true })).flatMap((node) => {
      const control = node as HTMLElement;
      const { x, y, width, height } = control.getBoundingClientRect();
      const bounds = { x: x + window.scrollX, y: y + window.scrollY, width, height };
      if (control instanceof HTMLSelectElement) {
        return Array.from(control.options)
          .filter((option) => option.selected || option.dataset.optionWon !== undefined)
          .map((option) => ({
            label: option.label.trim(), amount: option.dataset.optionWon, selected: option.selected, bounds,
          }));
      }
      const native = control instanceof HTMLInputElement;
      const label = native
        ? Array.from(control.labels ?? [], (item) => item.innerText.trim()).join(" ")
        : control.getAttribute("aria-label") ?? control.innerText.trim();
      return [{
        label,
        amount: control.dataset.optionWon,
        selected: native ? control.checked : control.getAttribute("aria-checked") === "true",
        bounds,
      }];
    }),
  );
  const options = optionControls.flatMap(({ amount, ...control }) => {
    const won = amount === undefined ? paidOptionFromText(control.label) : Number(amount);
    return won === null || !Number.isFinite(won) ? [] : [{ ...control, won }];
  });
  const structuredFees = await main.locator("[data-fee-id]").evaluateAll((nodes) =>
    nodes.filter((node) => node.checkVisibility({ opacityProperty: true, visibilityProperty: true })).map((node) => {
      const row = node as HTMLElement;
      const { x, y, width, height } = row.getBoundingClientRect();
      return {
        id: row.dataset.feeId!,
        label: row.innerText.trim(),
        won: Number(row.dataset.won),
        required: row.dataset.required === "true",
        bounds: { x: x + window.scrollX, y: y + window.scrollY, width, height },
      };
    }),
  );
  const feeRows = await main.locator("p, li, tr, dd").evaluateAll((nodes) =>
    nodes.filter((node) =>
      !node.closest("[data-fee-id]") && !node.querySelector("[data-fee-id], p, li, tr, dd") &&
      node.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
    ).map((node) => {
      const row = node as HTMLElement;
      const { x, y, width, height } = row.getBoundingClientRect();
      return { label: row.innerText.trim(), bounds: { x: x + window.scrollX, y: y + window.scrollY, width, height } };
    }),
  );
  const structuredKeys = new Set(structuredFees.flatMap((fee) => {
    const parsed = mandatoryFeeFromText(fee.label);
    return parsed ? [parsed.key] : [];
  }));
  const textFees = feeRows.flatMap((row) => {
    const parsed = mandatoryFeeFromText(row.label);
    return !parsed || structuredKeys.has(parsed.key) ? [] : [{
      ...row, id: "text:" + parsed.key, won: parsed.won, required: true,
    }];
  });
  const fees = [...structuredFees, ...textFees];
  const displayedPrices = await main.locator('[aria-label="가격 내역"] li, [data-total]').allInnerTexts();
  const priceLines = [...new Set([...displayedPrices, ...textFees.map(({ label }) => label)])];
  const screenshot = stage + ".png";
  const origin = fullPage ? { x: 0, y: 0 } : await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const sensitiveFields = page.locator([
    'input[type="password"]', 'input[type="email"]', 'input[type="tel"]',
    'input[autocomplete*="email" i]', 'input[autocomplete*="tel" i]',
    'input[autocomplete*="street" i]', 'input[autocomplete*="postal" i]',
    'textarea',
  ].join(", "));
  const png = await page.screenshot({
    path: join(directory, screenshot), fullPage, scale: "css",
    mask: [sensitiveFields], maskColor: "#111827",
  });
  // PNG IHDR stores the rendered width and height as unsigned big-endian integers.
  const screenshotArea = { ...origin, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const capturedAt = new Date().toISOString();
  return { stage, url, screenshot, screenshotArea, capturedAt, priceLines, options, fees };
}

export async function scanDemo(
  browser: Browser, origin: string, scenario: Scenario, directory: string,
  onStage?: (snapshot: Snapshot) => Promise<void>, viewport: "DESKTOP" | "MOBILE" = "DESKTOP",
  purchasePath: "CART" | "DIRECT" = "CART",
) {
  const base = new URL(origin);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.href !== base.origin + "/") {
    throw new Error("데모는 http://127.0.0.1의 로컬 서버만 지원합니다.");
  }

  const path = "/demo/" + scenario + "/";
  const targetUrl = base.origin + path + "product";
  const selectedStages: Stage[] = purchasePath === "DIRECT" ? ["product", "checkout"] : [...stages];
  const routes = new Set<string>(selectedStages.map((stage) => path + stage));
  await mkdir(directory, { recursive: true });
  const mobile = viewport === "MOBILE";
  const context = await browser.newContext({
    serviceWorkers: "block", javaScriptEnabled: true, locale: "ko-KR", timezoneId: "Asia/Seoul",
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, acceptDownloads: false,
  });
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const isAsset = url.pathname.startsWith("/_next/static/");
      if (request.method() !== "GET" || url.origin !== base.origin ||
          !(request.isNavigationRequest() ? routes.has(url.pathname) : isAsset)) {
        await route.abort();
        return;
      }

      // Disable automatic redirect following so a redirect cannot escape the allowlist.
      const response = await route.fetch({ maxRedirects: 0, timeout: 10_000 }).catch(() => null);
      if (!response || (response.status() >= 300 && response.status() < 400)) {
        await route.abort();
        return;
      }
      // The page may navigate or the context may close while a late static asset
      // is being proxied. That request is no longer evidence-critical.
      await route.fulfill({ response }).catch(() => route.abort().catch(() => {}));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const snapshots: Snapshot[] = [];
    const interactions = [];
    for (const stage of selectedStages) {
      let snapshot: Snapshot;
      try {
        if (stage === "product") {
          const response = await page.goto(targetUrl);
          if (!response?.ok()) throw new Error("데모 상품 페이지를 불러오지 못했습니다.");
        } else if (stage === "cart") {
          await page.getByRole("button", { name: "장바구니에 담기", exact: true }).click();
        } else {
          await page.getByRole("link", { name: purchasePath === "DIRECT" ? "바로구매" : "주문서 보기", exact: true }).click();
        }
        snapshot = await capture(page, stage, directory, page.locator('main[data-stage="' + stage + '"]'));
        if (stage === "product") interactions.push(...await observePaidOptionChanges(page, page.locator('main[data-stage="product"]'), stage));
      } catch (error) {
        if (snapshots.length === 0) throw error;
        break;
      }
      snapshots.push(snapshot);
      await onStage?.(snapshot);
    }
    const report = {
      comparisonVersion: scanComparisonVersion,
      scanStatus: snapshots.length === selectedStages.length ? "COMPLETED" : "PARTIAL",
      executionMode: "DEMO" as const,
      viewport,
      purchasePath,
      scenario,
      targetUrl,
      snapshots,
      interactions,
      priceLedger: buildPriceLedger(snapshots),
      findings: detect(snapshots),
    } as const;
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await context.close();
  }
}
