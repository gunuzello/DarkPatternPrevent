import type { Finding, Snapshot } from "../rules";

// A text signal is not a factual determination that a countdown or stock claim
// is false. It is a review candidate when multiple urgency/scarcity cues are
// visible together, which keeps this rule useful across storefront designs.
const urgency = /(?:마감\s*임박|남은\s*시간|오늘\s*만|선착순|한정\s*(?:시간|수량)|limited\s*time|hurry|ends?\s*(?:soon|today)|countdown)/i;
const scarcity = /(?:마지막\s*재고|재고\s*\d+\s*개?|품절\s*임박|동시\s*접속|지금\s*\d+명|only\s*\d+\s*left|\d+\s*viewing|low\s*stock)/i;

export function detectUrgencyScarcity(product: Snapshot): Finding[] {
  const lines = product.textLines ?? [];
  const urgencyLine = lines.find((line) => urgency.test(line));
  const scarcityLine = lines.find((line) => scarcity.test(line));
  if (!urgencyLine || !scarcityLine) return [];
  return [{
    type: "URGENCY_SCARCITY",
    status: "SUSPECTED",
    ruleVersion: "1",
    stage: product.stage,
    reason: `긴급성·희소성 표현이 함께 노출되어 검토가 필요합니다. ${urgencyLine} / ${scarcityLine}`,
    evidence: [product],
  }];
}
