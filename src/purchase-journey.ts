import type { Locator, Page, Response } from "playwright";
import type { Stage } from "./demo";
import type { InteractionEvidence, NetworkPriceEvidence } from "./rules";

const addCart = /(?:장바구니|카트|담기|add\s+to\s+(?:cart|bag|basket))/i;
const openCart = /(?:장바구니|카트|cart|bag|basket)(?:\s*(?:보기|열기|가기))?$/i;
const checkout = /(?:주문서|주문|구매|결제|checkout|proceed\s+to\s+checkout)/i;
// Keep the candidate count visible to the blocker logic: a storefront may have
// several product-card purchase buttons, so we must not guess which item to buy.
const directBuy = /(?:바로\s*구매|즉시\s*구매|특가\s*구매|구매하기|buy\s+now|order\s+now)/i;
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

async function actionCandidate(page: Page, pattern: RegExp) {
  const candidates = page.getByRole("button", { name: pattern })
    .or(page.getByRole("link", { name: pattern }))
    .filter({ visible: true });
  const roleCount = await candidates.count();
  const inputs = page.locator('input[type="submit"], input[type="button"]');
  const matchingInputIndexes: number[] = [];
  for (let index = 0; roleCount === 0 && index < await inputs.count(); index++) {
    const input = inputs.nth(index);
    if (!await input.isVisible().catch(() => false)) continue;
    const name = (await input.getAttribute("value") ?? "") + " " + (await input.getAttribute("aria-label") ?? "");
    if (pattern.test(name)) matchingInputIndexes.push(index);
  }
  const count = roleCount + matchingInputIndexes.length;
  if (count !== 1) return { action: null, count };
  return roleCount === 1
    ? { action: candidates.first(), count }
    : { action: inputs.nth(matchingInputIndexes[0]), count };
}

async function prepareRequiredOptions(page: Page, stage: Stage): Promise<InteractionEvidence[]> {
  const evidence: InteractionEvidence[] = [];
  const selects = page.locator("select[required]:visible");
  for (let index = 0; index < Math.min(await selects.count(), 12); index++) {
    const select = selects.nth(index);
    if (await select.isDisabled() || await select.inputValue()) continue;
    const option = await select.locator("option:not([disabled])").evaluateAll((items) => items
      .map((item) => ({ value: (item as HTMLOptionElement).value, text: item.textContent?.trim() ?? "" }))
      .find((item) => item.value && !/^(?:선택|choose|select)/i.test(item.text)) ?? null);
    if (!option) continue;
    const label = await select.evaluate((node: HTMLSelectElement) =>
      Array.from(node.labels ?? [], (item) => item.innerText.trim()).join(" ") || node.name || "필수 선택");
    await select.selectOption(option.value);
    evidence.push({
      id: `${stage}:required-select:${index}`, stage, kind: "REQUIRED_OPTION_SELECTION",
      capturedAt: new Date().toISOString(), controlLabel: label, beforeSelected: false, afterSelected: true, outcome: "OBSERVED",
    });
  }
  const radios = page.locator('input[type="radio"][required]:visible');
  const handled = new Set<string>();
  for (let index = 0; index < Math.min(await radios.count(), 20); index++) {
    const radio = radios.nth(index);
    const name = await radio.getAttribute("name") ?? `radio-${index}`;
    if (handled.has(name)) continue;
    handled.add(name);
    const group = page.locator(`input[type="radio"][required][name=${JSON.stringify(name)}]`);
    if (await group.evaluateAll((items) => items.some((item) => (item as HTMLInputElement).checked))) continue;
    const choice = group.filter({ visible: true }).first();
    if (!await choice.count() || await choice.isDisabled()) continue;
    const label = await choice.evaluate((node: HTMLInputElement) =>
      Array.from(node.labels ?? [], (item) => item.innerText.trim()).join(" ") || node.value || "필수 선택");
    await choice.check();
    evidence.push({
      id: `${stage}:required-radio:${name}`, stage, kind: "REQUIRED_OPTION_SELECTION",
      capturedAt: new Date().toISOString(), controlLabel: label, beforeSelected: false, afterSelected: true, outcome: "OBSERVED",
    });
  }
  return evidence;
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

/** Close a blocking modal only when its visible dialog exposes one unambiguous
 * dismiss control. Never press arbitrary overlays or marketing actions. */
async function dismissBlockingDialog(page: Page) {
  const dialogs = page.locator('[role="dialog"]:visible, [aria-modal="true"]:visible, div.fixed.inset-0:visible');
  for (let index = 0; index < Math.min(await dialogs.count(), 3); index++) {
    const dialog = dialogs.nth(index);
    const close = dialog.locator('button:visible, [role="button"]:visible, a:visible')
      .filter({ hasText: /닫기|close|취소|나중에|다음에|건너뛰기|skip|dismiss|×|\bX\b/i })
      .or(dialog.locator('button[aria-label*="닫" i]:visible, button[aria-label*="close" i]:visible, button[title*="닫" i]:visible, button[title*="close" i]:visible, button:has(svg.lucide-x):visible'));
    if (await close.count() !== 1) continue;
    await close.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(150);
  }
}

async function isCheckoutLike(page: Page) {
  const url = page.url();
  if (/(?:checkout|order|payment|buy)/i.test(new URL(url).pathname)) return true;
  const text = await page.locator("body").innerText().catch(() => "");
  const hasCheckoutCopy = /(?:주문서|주문\s*정보|결제\s*정보|배송\s*정보|checkout|payment|place\s+order)/i.test(text);
  const hasCustomerForm = await page.locator('input:not([type="hidden"]), select, textarea').count() > 0;
  return hasCheckoutCopy && hasCustomerForm;
}

async function discoverSurfaceDestinations(page: Page) {
  const origin = new URL(page.url()).origin;
  return page.locator("a[href]").evaluateAll((anchors, expectedOrigin) => anchors.flatMap((anchor) => {
    const text = (anchor.textContent ?? anchor.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim();
    const raw = anchor.getAttribute("href") ?? "";
    if (!text || !raw) return [];
    try {
      const parsed = new URL(raw, window.location.href);
      if (parsed.origin !== expectedOrigin || !/^https?:$/.test(parsed.protocol)) return [];
      parsed.hash = "";
      const kind = /로그인|회원가입|sign\s*in|log\s*in|account/i.test(text) ? "AUTH"
        : /구독|멤버십|정기\s*결제|자동\s*(?:갱신|연장)|subscription|membership/i.test(text) ? "SUBSCRIPTION"
        : /해지|탈퇴|환불|구독\s*취소|cancel|unsubscribe/i.test(text) ? "CANCELLATION" : null;
      return kind ? [{ kind, text, href: parsed.href }] : [];
    } catch { return []; }
  }), origin);
}

export type SurfaceObservation = {
  evidenceId: string;
  kind: "AUTH" | "SUBSCRIPTION" | "CANCELLATION";
  url: string;
  status: number | null;
  title: string;
  text: string;
  outcome: "OBSERVED" | "FETCH_FAILED" | "CROSS_ORIGIN";
};

async function inspectSurfaceDestinations(page: Page, destinations: { kind: SurfaceObservation["kind"]; href: string }[]): Promise<SurfaceObservation[]> {
  const origin = new URL(page.url()).origin;
  const observations: SurfaceObservation[] = [];
  for (const destination of destinations.slice(0, 4)) {
    if (new URL(destination.href).origin !== origin) {
      observations.push({ evidenceId: `surface:${destination.kind.toLowerCase()}:${observations.length}`, kind: destination.kind, url: destination.href, status: null, title: "", text: "", outcome: "CROSS_ORIGIN" });
      continue;
    }
    const probe = await page.context().newPage();
    try {
      const response = await probe.goto(destination.href, { waitUntil: "domcontentloaded", timeout: 5_000 });
      await probe.waitForLoadState("networkidle", { timeout: 1_000 }).catch(() => {});
      observations.push({
        evidenceId: `surface:${destination.kind.toLowerCase()}:${observations.length}`, kind: destination.kind, url: destination.href, status: response?.status() ?? null,
        title: await probe.title().catch(() => ""),
        text: (await probe.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 1_000),
        outcome: response?.ok() ? "OBSERVED" : "FETCH_FAILED",
      });
    } catch {
      observations.push({ evidenceId: `surface:${destination.kind.toLowerCase()}:${observations.length}`, kind: destination.kind, url: destination.href, status: null, title: "", text: "", outcome: "FETCH_FAILED" });
    } finally {
      await probe.close().catch(() => {});
    }
  }
  return observations;
}

export type JourneyObservation = {
  stage: Stage;
  url: string;
  action: InteractionEvidence;
};

export type JourneyBlocker = {
  stage: Stage;
  code: "ACTION_NOT_FOUND" | "ACTION_AMBIGUOUS" | "ACTION_FAILED" | "LOGIN_REQUIRED";
  action: "ADD_TO_CART" | "OPEN_CHECKOUT" | "DIRECT_BUY";
  candidateCount: number;
};

async function missingActionBlocker(page: Page, count: number, action: JourneyBlocker["action"]): Promise<JourneyBlocker> {
  const text = await page.locator("body").innerText().catch(() => "");
  const login = /(?:로그인|회원가입|sign\s*in|log\s*in|account\s+required|please\s+sign)/i.test(text) &&
    !/(?:로그아웃|sign\s*out|log\s*out)/i.test(text);
  return { stage: action === "OPEN_CHECKOUT" ? "cart" : "product", code: login ? "LOGIN_REQUIRED" : count ? "ACTION_AMBIGUOUS" : "ACTION_NOT_FOUND", action, candidateCount: count };
}

/** Explore only as far as the checkout form. It never clicks a final-order action. */
export async function explorePurchaseJourney(
  page: Page, onStage?: (stage: Stage) => Promise<void>, purchasePath: "CART" | "DIRECT" = "CART",
) {
  let stage: Stage = "product";
  const observations: JourneyObservation[] = [];
  const network: NetworkPriceEvidence[] = [];
  let surfaceDestinations: Awaited<ReturnType<typeof discoverSurfaceDestinations>> = [];
  let surfaceObservations: SurfaceObservation[] = [];
  const refreshSurface = async () => {
    const discovered = await discoverSurfaceDestinations(page);
    const known = new Set(surfaceDestinations.map(({ href }) => href));
    const fresh = discovered.filter(({ href }) => !known.has(href));
    surfaceDestinations = [...surfaceDestinations, ...fresh].slice(0, 12);
    if (fresh.length) {
      surfaceObservations = [...surfaceObservations, ...await inspectSurfaceDestinations(page, fresh.map(({ kind, href }) => ({ kind: kind as SurfaceObservation["kind"], href })))].slice(0, 12);
    }
  };
  await refreshSurface();
  const pending = new Set<Promise<void>>();
  page.on("response", (response) => {
    if (new URL(response.url()).origin !== new URL(page.url()).origin) return;
    const task = priceEvidence(response, stage).then((item) => { if (item) network.push(item); });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  await onStage?.(stage);
  observations.push(...(await prepareRequiredOptions(page, stage)).map((action) => ({ stage, url: page.url(), action })));

  if (purchasePath === "DIRECT") {
    const direct = await actionCandidate(page, directBuy);
    if (!direct.action) return {
      observations, network, surfaceDestinations, surfaceObservations, reached: stage,
    blocker: await missingActionBlocker(page, direct.count, "DIRECT_BUY"),
    };
    const before = page.url();
    try { await clickAndSettle(page, direct.action); } catch {
      return { observations, network, surfaceDestinations, surfaceObservations, reached: stage,
        blocker: { stage, code: "ACTION_FAILED", action: "DIRECT_BUY", candidateCount: 1 } satisfies JourneyBlocker };
    }
    observations.push({ stage, url: before, action: {
      id: "product:direct-buy", stage, kind: "NAVIGATION", capturedAt: new Date().toISOString(), outcome: "OBSERVED",
    }});
    if (!await isCheckoutLike(page)) return { observations, network, surfaceDestinations, surfaceObservations, reached: "product" as Stage,
      blocker: { stage: "product" as Stage, code: "ACTION_FAILED" as const, action: "DIRECT_BUY" as const, candidateCount: 1 } };
    stage = "checkout";
    await refreshSurface();
    await onStage?.(stage);
    await Promise.allSettled([...pending]);
    return { observations, network, surfaceDestinations, surfaceObservations, reached: stage };
  }

  const add = await actionCandidate(page, addCart);
  if (!add.action) return {
    observations, network, surfaceDestinations, surfaceObservations, reached: stage,
    blocker: await missingActionBlocker(page, add.count, "ADD_TO_CART"),
  };
  const before = page.url();
  try { await clickAndSettle(page, add.action); } catch {
    return { observations, network, surfaceDestinations, surfaceObservations, reached: stage,
      blocker: { stage, code: "ACTION_FAILED", action: "ADD_TO_CART", candidateCount: 1 } satisfies JourneyBlocker };
  }
  observations.push({ stage, url: before, action: {
    id: "product:add-cart", stage, kind: "NAVIGATION", capturedAt: new Date().toISOString(), outcome: "OBSERVED",
  }});

  const cartAction = await actionCandidate(page, openCart);
  if (cartAction.action) {
    await dismissBlockingDialog(page);
    await clickAndSettle(page, cartAction.action);
  }
  stage = "cart";
  await refreshSurface();
  await onStage?.(stage);

  const next = await actionCandidate(page, checkout);
  if (!next.action) return {
    observations, network, surfaceDestinations, surfaceObservations, reached: stage,
    blocker: await missingActionBlocker(page, next.count, "OPEN_CHECKOUT"),
  };
  const cartUrl = page.url();
  try { await clickAndSettle(page, next.action); } catch {
    return { observations, network, surfaceDestinations, surfaceObservations, reached: stage,
      blocker: { stage, code: "ACTION_FAILED", action: "OPEN_CHECKOUT", candidateCount: 1 } satisfies JourneyBlocker };
  }
  observations.push({ stage, url: cartUrl, action: {
    id: "cart:open-checkout", stage, kind: "NAVIGATION", capturedAt: new Date().toISOString(), outcome: "OBSERVED",
  }});
  if (!await isCheckoutLike(page)) return { observations, network, surfaceDestinations, surfaceObservations, reached: "cart" as Stage,
    blocker: { stage: "cart" as Stage, code: "ACTION_FAILED" as const, action: "OPEN_CHECKOUT" as const, candidateCount: 1 } };
  stage = "checkout";
  await refreshSurface();
  await onStage?.(stage);
  await Promise.allSettled([...pending]);
  return { observations, network, surfaceDestinations, surfaceObservations, reached: stage };
}
