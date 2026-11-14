import { evidenceIds, type Finding, type Snapshot } from "../rules";

export function detectPreselection(product: Snapshot): Finding[] {
  const findings: Finding[] = [];
  for (const option of product.options) {
    const beneficial = /(?:무료|사은품|증정|증정품|gift|free)/i.test(option.label);
    if (option.selected && option.won > 0 && !beneficial) {
      findings.push({
        type: "PRESELECTION",
        status: "SUSPECTED",
        ruleVersion: "3",
        stage: "product",
        reason: "유료 옵션이 기본 선택되어 있습니다. " + option.label,
        elementBounds: option.bounds,
        evidence: [product],
        evidenceIds: evidenceIds([product]),
      });
    }
  }

  return findings;
}
