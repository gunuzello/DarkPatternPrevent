import type { Locator, Page } from "playwright";
import type { InteractionEvidence } from "./rules";
import type { Stage } from "./demo";

const won = (text: string) => [...text.matchAll(/(?:₩\s*|)(\d[\d,]*)\s*원/g)]
  .map((match) => Number(match[1].replaceAll(",", "")))
  .filter(Number.isFinite);

async function visibleTotal(main: Locator) {
  const preferred = main.locator('[data-total], [class*="total" i], [id*="total" i]').filter({ visible: true });
  const texts = await preferred.allInnerTexts();
  const amounts = texts.flatMap(won);
  return amounts.length ? Math.max(...amounts) : null;
}

/**
 * Reversibly toggles already-selected, visibly priced options. This never submits a
 * form and restores the original state before the purchase journey continues.
 */
export async function observePaidOptionChanges(page: Page, main: Locator, stage: Stage): Promise<InteractionEvidence[]> {
  // Keep a stable locator while toggling. A `:checked` locator would stop
  // referring to the control immediately after it is unchecked.
  const controls = main.locator('input:is([type="checkbox"], [type="radio"])');
  const count = Math.min(await controls.count(), 8);
  const evidence: InteractionEvidence[] = [{
    id: `${stage}:initial`, stage, kind: "INITIAL_STATE", capturedAt: new Date().toISOString(), outcome: "OBSERVED",
  }];
  for (let index = 0; index < count; index++) {
    const control = controls.nth(index);
    if (!await control.isVisible() || await control.isDisabled() || !await control.isChecked()) continue;
    const label = await control.evaluate((node: HTMLInputElement) =>
      Array.from(node.labels ?? [], (item) => item.innerText.trim()).join(" "));
    if (!won(label).some((amount) => amount > 0)) continue;
    const before = await visibleTotal(main);
    try {
      await control.uncheck({ timeout: 2_000 });
      await page.waitForTimeout(150);
      const after = await visibleTotal(main);
      evidence.push({
        id: `${stage}:paid-option:${index}`, stage, kind: "PAID_OPTION_TOGGLE", capturedAt: new Date().toISOString(),
        controlLabel: label, beforeSelected: true, afterSelected: false,
        beforeTotalWon: before, afterTotalWon: after,
        amountDeltaWon: before !== null && after !== null ? before - after : null,
        outcome: before !== null && after !== null && before !== after ? "OBSERVED" : "NO_LIVE_CHANGE",
      });
    } finally {
      await control.check({ timeout: 2_000 }).catch(() => {});
    }
  }
  return evidence;
}
