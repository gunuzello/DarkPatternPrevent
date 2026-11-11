import type { Stage } from "./demo";

export type Option = { label: string; won: number; selected: boolean };
export type Fee = { id: string; label: string; won: number; required: boolean };
export type Snapshot = {
  stage: Stage;
  url: string;
  screenshot: string;
  priceLines: string[];
  options: Option[];
  fees: Fee[];
};
export type Finding = {
  type: "PRESELECTION" | "DRIP_PRICING";
  status: "SUSPECTED";
  ruleVersion: "1";
  stage: Stage;
  reason: string;
  evidence: Snapshot[];
};

export function detect([product, cart, checkout]: [Snapshot, Snapshot, Snapshot]): Finding[] {
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

  const disclosed = new Set(product.fees.map((fee) => fee.id));
  for (const snapshot of [cart, checkout]) {
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
