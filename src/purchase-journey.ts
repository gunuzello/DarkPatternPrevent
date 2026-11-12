import type { Locator, Page, Response } from "playwright";
import type { Stage } from "./demo";
import type { InteractionEvidence, NetworkPriceEvidence } from "./rules";

const addCart = /^(?:장바구니(?:에\s*담기)?|카트에\s*담기|add\s+to\s+(?:cart|bag|basket))$/i;
const openCart = /^(?:장바구니|카트|cart|bag|basket)(?:\s*보기)?$/i;
const checkout = /^(?:주문서\s*보기|주문하기|구매하기|결제하기|checkout|proceed\s+to\s+checkout)$/i;
const forbidden = /^(?:결제|주문|구매)\s*(?:완료|확정)|place\s+order|pay\s+now$/i;
const priceKey = /(?:^|_)(?:total|subtotal|price|amount|shipping|delivery|fee|discount)(?:_|$)/i;

function extractPrices(value: unknown, path = "$", depth = 0): { path: string; won: number }[] {
  if (depth > 6 || value === null) return [];
  if (Array.isArray(value)) return value.slice(0, 50).flatMap((item, index) => extractPrices(item, `${path}[${index}]`, depth + 1));
  if (typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).slice(0, 100).flatMap(([key, item]) => {
    const next = `${path}.${key}`;
    if (priceKey.test(key) && (typeof item === "number" || typeof item === "string")) {
      const number = Number(String(item).replaceAll(",", ""));
      if (Number.isFinite(number) && number >= 0 && number <= 1_000_000_000) return [{ path: next, won: number }];
    }
    return extractPrices(item, next, depth + 1);
  });
}

export async function priceEvidence(response: Response, stage: Stage): Promise<NetworkPriceEvidence | null> {
  const type = response.headers()["content-type"] ?? "";
  if (!/^application\/(?:[\w.+-]*\+)?json\b/i.test(type) || !response.ok()) return null;
  const length = Number(response.headers()["content-length"] ?? 0);
  if (length > 256_000) return null;
  const body = await response.json().catch(() => null);
  const values = extractPrices(body);
  if (!values.length) return null;
  return { id: `network:${stage}:${Date.now()}`, stage, url: response.url(), capturedAt: new Date().toISOString(), values };
}

async function uniqueAction(page: Page, pattern: RegExp): Promise<Locator | null> {
  const candidates = page.getByRole("button", { name: pattern }).or(page.getByRole("link", { name: pattern })).filter({ visible: true });
  return await candidates.count() === 1 ? candidates.first() : null;
}

async function clickAndSettle(page: Page, action: Locator) {
  const before = page.url();
  await Promise.all([
    page.waitForURL((url) => url.href !== before, { timeout: 5_000 }).catch(() => null),
    action.click(),
  ]);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
}

export type JourneyObservation = {
  stage: Stage;
  url: string;
  action: InteractionEvidence;
};

/** Explore only as far as the checkout form. It never clicks a final-order action. */
export async function explorePurchaseJourney(page: Page, onStage?: (stage: Stage) => Promise<void>) {
  let stage: Stage = "product";
  const observations: JourneyObservation[] = [];
  const network: NetworkPriceEvidence[] = [];
  const pending = new Set<Promise<void>>();
  page.on("response", (response) => {
    if (new URL(response.url()).origin !== new URL(page.url()).origin) return;
    const task = priceEvidence(response, stage).then((item) => { if (item) network.push(item); });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  await onStage?.(stage);

  const add = await uniqueAction(page, addCart);
  if (!add || await uniqueAction(page, forbidden)) return { observations, network, reached: stage };
  const before = page.url();
  await clickAndSettle(page, add);
  observations.push({ stage, url: before, action: {
    id: "product:add-cart", stage, kind: "NAVIGATION", capturedAt: new Date().toISOString(), outcome: "OBSERVED",
  }});

  let cartAction = await uniqueAction(page, openCart);
  if (cartAction) {
    await clickAndSettle(page, cartAction);
  }
  stage = "cart";
  await onStage?.(stage);

  const next = await uniqueAction(page, checkout);
  if (!next || await uniqueAction(page, forbidden)) return { observations, network, reached: stage };
  const cartUrl = page.url();
  await clickAndSettle(page, next);
  observations.push({ stage, url: cartUrl, action: {
    id: "cart:open-checkout", stage, kind: "NAVIGATION", capturedAt: new Date().toISOString(), outcome: "OBSERVED",
  }});
  stage = "checkout";
  await onStage?.(stage);
  await Promise.allSettled([...pending]);
  return { observations, network, reached: stage };
}
