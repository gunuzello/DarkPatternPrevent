import type { Snapshot } from "./rules";

export type ReviewCandidate = {
  id: string;
  kind: "FEE_SEMANTICS" | "OPTION_SEMANTICS";
  stage: Snapshot["stage"];
  text: string;
  reason: string;
  evidenceIds: string[];
};

const amount = /(?:[₩$£€]\s*\d[\d,.]*|\d[\d,.]*\s*원)/;
const feeWords = /(?:배송비|처리비|포장비|서비스비|수수료|보증|보험|추가비용|fee|shipping|handling|service|warranty)/i;
const optionWords = /(?:옵션|추가|부가|포장|보증|보험|서비스|option|add[- ]?on|warranty)/i;

/**
 * Build a bounded, model-ready queue without making an AI call. Numeric and
 * stateful observations stay in deterministic rules; only unresolved wording
 * is queued for a later dictionary/classifier/LLM stage.
 */
export function collectReviewCandidates(snapshots: Snapshot[]): ReviewCandidate[] {
  const candidates: ReviewCandidate[] = [];
  for (const snapshot of snapshots) {
    const evidenceId = snapshot.evidenceId ?? `evidence:${snapshot.stage}`;
    for (const [index, line] of (snapshot.textLines ?? []).entries()) {
      if (!amount.test(line)) continue;
      if (feeWords.test(line) && !/^필수\s*(?:배송비|처리비|포장비|서비스비|수수료)/.test(line)) {
        candidates.push({
          id: `review:${evidenceId}:fee:${index}`, kind: "FEE_SEMANTICS", stage: snapshot.stage,
          text: line, reason: "금액이 포함된 비용 항목의 필수·조건부 의미를 확정하지 못했습니다.", evidenceIds: [evidenceId],
        });
      } else if (optionWords.test(line) && !/[+]\s*\d[\d,]*\s*원/.test(line)) {
        candidates.push({
          id: `review:${evidenceId}:option:${index}`, kind: "OPTION_SEMANTICS", stage: snapshot.stage,
          text: line, reason: "금액이 포함된 옵션 문구의 별도 거래 여부를 확정하지 못했습니다.", evidenceIds: [evidenceId],
        });
      }
      if (candidates.length >= 40) return candidates;
    }
  }
  return candidates;
}
