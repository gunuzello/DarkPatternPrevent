import type { Finding, Snapshot } from "../rules";

export function detectDripPricing(product: Snapshot, later: Snapshot[]): Finding[] {
  const findings: Finding[] = [];
  const disclosed = new Set(product.fees.map((fee) => fee.id));
  for (const snapshot of later) {
    for (const fee of snapshot.fees) {
      if (fee.required && fee.won > 0 && !disclosed.has(fee.id)) {
        findings.push({
          type: "DRIP_PRICING",
          status: "SUSPECTED",
          ruleVersion: "1",
          stage: snapshot.stage,
          reason: "상품 상세 이후에 필수 비용이 처음 표시됩니다. " + fee.label,
          evidence: [product, snapshot],
        });
      }
      disclosed.add(fee.id);
    }
  }
  return findings;
}
