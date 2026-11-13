import { evidenceIds, type Fee, type Finding, type PriorFeeDisclosure, type Snapshot } from "../rules";
import { mandatoryFeeFromText } from "../price-text";

function paidRequired(fee: Fee) {
  return fee.required && fee.won > 0;
}

function sameFee(prior: Fee, current: Fee) {
  if (prior.id === current.id) return true;
  if (!prior.id.startsWith("text:") && !current.id.startsWith("text:")) return false;
  const name = mandatoryFeeFromText(prior.label)?.key;
  return name !== undefined && name === mandatoryFeeFromText(current.label)?.key;
}

export function detectDripPricing(product: Snapshot, later: Snapshot[], priorDisclosures: PriorFeeDisclosure[] = []): Finding[] {
  const findings: Finding[] = [];
  const disclosed = product.fees.filter(paidRequired);
  for (const snapshot of later) {
    for (const fee of snapshot.fees.filter(paidRequired)) {
      const currentKey = mandatoryFeeFromText(fee.label)?.key;
      if (currentKey && priorDisclosures.some((item) => item.key === currentKey && item.won === fee.won)) continue;
      if (disclosed.some((prior) => sameFee(prior, fee))) continue;
      findings.push({
        type: "DRIP_PRICING",
        status: "SUSPECTED",
        ruleVersion: "3",
        stage: snapshot.stage,
        reason: "상품 상세 이후에 필수 비용이 처음 표시됩니다. " + fee.label,
        elementBounds: fee.bounds,
        evidence: [product, snapshot],
        evidenceIds: evidenceIds([product, snapshot]),
      });
      disclosed.push(fee);
    }
  }
  return findings;
}
