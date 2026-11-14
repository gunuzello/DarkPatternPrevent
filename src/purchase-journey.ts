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
  // Prefer the explicit product-detail CTA when card-level "담기" buttons
  // remain mounted behind an in-place detail view.
  if (pattern === addCart) {
    const exact = page.getByRole("button", { name: /장바구니\s*담기|add\s*to\s*(?:cart|bag|basket)/i })
      .or(page.getByRole("link", { name: /장바구니\s*담기|add\s*to\s*(?:cart|bag|basket)/i }))
      .filter({ visible: true });
    if (await exact.count() > 0) return { action: exact.last(), count: 1 };
    const detail = page.locator('button:visible, a:visible').filter({
      hasText: /장바구니\s*담기|add\s*to\s*(?:cart|bag|basket)/i,
    });
    if (await detail.count() === 1) return { action: detail.first(), count: 1 };
  }
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
  const urlChanged = page.waitForURL((url) => url.href !== before, { timeout: 2_000 })
    .then(() => true).catch(() => false);
  await action.click();
  // React storefronts commonly update drawers/modals without navigation. Do
  // not pay the full navigation timeout when the DOM settles in place.
  const navigated = await Promise.race([
    urlChanged,
    page.waitForTimeout(600).then(() => false),
  ]);
  if (navigated) await page.waitForLoadState("domcontentloaded", { timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(150);
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

async function isCartLike(page: Page) {
  const path = new URL(page.url()).pathname;
  const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  if (/(?:장바구니|카트|cart|bag|basket)\s*(?:\(|:)?\s*0\b|(?:장바구니|카트).{0,12}(?:비어|없습니다)|(?:cart|bag|basket).{0,12}(?:empty|no items)/i.test(text)) return false;
  const heading = page.getByRole("heading", { name: /장바구니|카트|cart|bag|basket/i }).filter({ visible: true });
  const surface = /(?:cart|bag|basket)/i.test(path) || await heading.count() > 0;
  if (!surface) return false;
  const checkoutAction = page.getByRole("button", { name: checkout })
    .or(page.getByRole("link", { name: checkout })).filter({ visible: true });
  return await checkoutAction.count() > 0 || /(?:소계|합계|총\s*상품|수량|삭제|subtotal|total|quantity|remove)/i.test(text);
}

async function discoverSurfaceDestinations(page: Page) {
  const origin = new URL(page.url()).origin;
  const links = await page.locator("a[href]").evaluateAll((anchors, expectedOrigin) => anchors.flatMap((anchor) => {
    const text = (anchor.textContent ?? anchor.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim();
    const raw = anchor.getAttribute("href") ?? "";
    if (!text || !raw) return [];
    try {
      const parsed = new URL(raw, window.location.href);
      if (parsed.origin !== expectedOrigin || !/^https?:$/.test(parsed.protocol)) return [];
      parsed.hash = "";
    const kind = /로그인|회원가입|sign\s*in|log\s*in|account/i.test(text) ? "AUTH"
        : /구독|멤버십|정기\s*결제|자동\s*(?:갱신|연장)|subscription|membership/i.test(text) ? "SUBSCRIPTION"
        : /해지|탈퇴|환불|구독\s*취소|cancel|unsubscribe/i.test(text) ? "CANCELLATION"
          : /쿠폰|할인코드|프로모션|coupon|promo/i.test(text) ? "COUPON"
            : /추천|인기|베스트|recommend|popular|best/i.test(text) ? "RECOMMENDATION"
              : /배송|교환|반품|환불|이용약관|개인정보|policy|shipping|return/i.test(text) ? "POLICY"
                : /카테고리|상품목록|전체상품|category|catalog|shop\s*all/i.test(text) ? "CATALOG" : null;
      return kind ? [{ kind, text, href: parsed.href, source: "LINK" as const }] : [];
    } catch { return []; }
  }), origin);
  const buttons = await page.locator("button:visible, [role=button]:visible").evaluateAll((controls) => controls.flatMap((control) => {
    const text = (control.textContent ?? control.getAttribute("aria-label") ?? control.getAttribute("title") ?? "").replace(/\s+/g, " ").trim();
    if (!text) return [];
    const kind = /로그인|회원가입|sign\s*in|log\s*in|account/i.test(text) ? "AUTH"
      : /구독|멤버십|정기\s*결제|자동\s*(?:갱신|연장)|subscription|membership/i.test(text) ? "SUBSCRIPTION"
      : /해지|탈퇴|환불|구독\s*취소|cancel|unsubscribe/i.test(text) ? "CANCELLATION"
        : /쿠폰|할인코드|프로모션|coupon|promo/i.test(text) ? "COUPON"
          : /추천|인기|베스트|후기|리뷰|recommend|popular|best|review/i.test(text) ? "RECOMMENDATION"
            : /배송|교환|반품|환불|이용약관|개인정보|policy|shipping|return|exchange|terms|privacy/i.test(text) ? "POLICY"
              : /카테고리|상품목록|전체상품|전체\s*보기|검색|가구|키친|패브릭|테크|향\/|category|catalog|shop\s*all|search/i.test(text) ? "CATALOG" : null;
    return kind ? [{ kind, text, href: window.location.href, source: "BUTTON" as const }] : [];
  }));
  return [...links, ...buttons];
}

export type SurfaceObservation = {
  evidenceId: string;
  kind: "AUTH" | "SUBSCRIPTION" | "CANCELLATION" | "COUPON" | "RECOMMENDATION" | "POLICY" | "CATALOG";
  url: string;
  status: number | null;
  title: string;
  text: string;
  source?: "LINK" | "BUTTON";
  outcome: "OBSERVED" | "DISCOVERED" | "FETCH_FAILED" | "CROSS_ORIGIN";
};

async function inspectSurfaceDestinations(page: Page, destinations: { kind: SurfaceObservation["kind"]; href: string; text?: string; source?: SurfaceObservation["source"] }[]): Promise<SurfaceObservation[]> {
  const origin = new URL(page.url()).origin;
  return Promise.all(destinations.slice(0, 8).map(async (destination, index): Promise<SurfaceObservation> => {
    if (destination.source === "BUTTON") return { evidenceId: `surface:${destination.kind.toLowerCase()}:${index}`, kind: destination.kind, url: destination.href, status: null, title: destination.text ?? "", text: `버튼형 표면 후보: ${destination.text ?? "이름 없음"}`, source: "BUTTON", outcome: "DISCOVERED" };
    if (new URL(destination.href).origin !== origin) {
      return { evidenceId: `surface:${destination.kind.toLowerCase()}:${index}`, kind: destination.kind, url: destination.href, status: null, title: "", text: "", source: "LINK", outcome: "CROSS_ORIGIN" };
    }
    const probe = await page.context().newPage();
    try {
      const response = await probe.goto(destination.href, { waitUntil: "domcontentloaded", timeout: 3_500 });
      await probe.waitForTimeout(150);
      return {
        evidenceId: `surface:${destination.kind.toLowerCase()}:${index}`, kind: destination.kind, url: destination.href, status: response?.status() ?? null, source: "LINK",
        title: await probe.title().catch(() => ""),
        text: (await probe.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 1_000),
        outcome: response?.ok() ? "OBSERVED" : "FETCH_FAILED",
      };
    } catch {
      return { evidenceId: `surface:${destination.kind.toLowerCase()}:${index}`, kind: destination.kind, url: destination.href, status: null, title: "", text: "", source: "LINK", outcome: "FETCH_FAILED" };
    } finally {
      await probe.close().catch(() => {});
    }
  }));
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
    const known = new Set(surfaceDestinations.map(({ href, kind, text }) => `${kind}:${href}:${text}`));
    const fresh = discovered.filter(({ href, kind, text }) => !known.has(`${kind}:${href}:${text}`));
    surfaceDestinations = [...surfaceDestinations, ...fresh].slice(0, 12);
    if (fresh.length) {
      surfaceObservations = [...surfaceObservations, ...await inspectSurfaceDestinations(page, fresh.map(({ kind, href, text, source }) => ({ kind: kind as SurfaceObservation["kind"], href, text, source })))].slice(0, 24);
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
  if (!await isCartLike(page)) return {
    observations, network, surfaceDestinations, surfaceObservations, reached: "product" as Stage,
    blocker: { stage: "product" as Stage, code: "ACTION_FAILED" as const, action: "ADD_TO_CART" as const, candidateCount: 1 },
  };
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
