import type { Finding, Snapshot } from "../rules";

export function detectPreselection(product: Snapshot): Finding[] {
  const findings: Finding[] = [];
  for (const option of product.options) {
    if (option.selected && option.won > 0) {
      findings.push({
        type: "PRESELECTION",
        status: "SUSPECTED",
        ruleVersion: "1",
        stage: "product",
        reason: "유료 옵션이 기본 선택되어 있습니다. " + option.label,
        evidence: [product],
      });
    }
  }

  return findings;
}
