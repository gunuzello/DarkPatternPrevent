import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { stages, type Scenario, type Stage } from "./demo";
import { detect, type Snapshot } from "./rules";

async function capture(page: Page, stage: Stage, directory: string): Promise<Snapshot> {
  const main = page.locator('main[data-stage="' + stage + '"]');
  await main.waitFor({ state: "visible" });

  const optionSelector = [
    'input:is([type="checkbox"], [type="radio"])[data-option-won]',
    'select:has(option[data-option-won])',
    '[role="switch"][data-option-won]',
  ].join(", ");
  const options = await main.locator(optionSelector).evaluateAll((nodes) =>
    nodes.filter((node) => node.checkVisibility({ opacityProperty: true, visibilityProperty: true })).flatMap((node) => {
      const control = node as HTMLElement;
      const { x, y, width, height } = control.getBoundingClientRect();
      const bounds = { x: x + window.scrollX, y: y + window.scrollY, width, height };
      if (control instanceof HTMLSelectElement) {
        return Array.from(control.options)
          .filter((option) => option.dataset.optionWon !== undefined)
          .map((option) => ({
            label: option.label.trim(), won: Number(option.dataset.optionWon), selected: option.selected, bounds,
          }));
      }
      const native = control instanceof HTMLInputElement;
      const label = native
        ? Array.from(control.labels ?? [], (item) => item.innerText.trim()).join(" ")
        : control.getAttribute("aria-label") ?? control.innerText.trim();
      return [{
        label,
        won: Number(control.dataset.optionWon),
        selected: native ? control.checked : control.getAttribute("aria-checked") === "true",
        bounds,
      }];
    }),
  );
  const fees = await main.locator("[data-fee-id]").evaluateAll((nodes) =>
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
  const priceLines = await main.locator('[aria-label="가격 내역"] li, [data-total]').allInnerTexts();
  const screenshot = stage + ".png";
  await page.screenshot({ path: join(directory, screenshot), fullPage: true });
  return { stage, url: page.url(), screenshot, priceLines, options, fees };
}

export async function scanDemo(browser: Browser, origin: string, scenario: Scenario, directory: string, onStage?: (snapshot: Snapshot) => Promise<void>) {
  const base = new URL(origin);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.href !== base.origin + "/") {
    throw new Error("데모는 http://127.0.0.1의 로컬 서버만 지원합니다.");
  }

  const path = "/demo/" + scenario + "/";
  const targetUrl = base.origin + path + "product";
  const routes = new Set<string>(stages.map((stage) => path + stage));
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ serviceWorkers: "block", javaScriptEnabled: false });
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
      await route.fulfill({ response });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const snapshots: Snapshot[] = [];
    for (const stage of stages) {
      let snapshot: Snapshot;
      try {
        if (stage === "product") {
          const response = await page.goto(targetUrl);
          if (!response?.ok()) throw new Error("데모 상품 페이지를 불러오지 못했습니다.");
        } else if (stage === "cart") {
          await page.getByRole("button", { name: "장바구니에 담기", exact: true }).click();
        } else {
          await page.getByRole("link", { name: "주문서 보기", exact: true }).click();
        }
        snapshot = await capture(page, stage, directory);
      } catch (error) {
        if (snapshots.length === 0) throw error;
        break;
      }
      snapshots.push(snapshot);
      await onStage?.(snapshot);
    }
    const report = {
      scanStatus: snapshots.length === stages.length ? "COMPLETED" : "PARTIAL",
      scenario,
      targetUrl,
      snapshots,
      findings: detect(snapshots),
    } as const;
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await context.close();
  }
}
