import type { Snapshot } from "./rules";
import type { SurfaceObservation } from "./purchase-journey";

export type ReviewCandidate = {
  id: string;
  kind: "FEE_SEMANTICS" | "OPTION_SEMANTICS" | "SURFACE_FLOW";
  stage: Snapshot["stage"] | "surface";
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

export function collectSurfaceReviewCandidates(observations: SurfaceObservation[]): ReviewCandidate[] {
  const candidates = observations.filter((item) => item.outcome === "OBSERVED").map((item, index) => ({
    id: `review:surface:${item.kind.toLowerCase()}:${index}`,
    kind: "SURFACE_FLOW" as const,
    stage: "surface" as const,
    text: item.text.slice(0, 240) || item.title || item.url,
    reason: item.kind === "AUTH"
      ? "회원가입·로그인 경로를 확인했지만 구매 전 강제 여부와 비회원 대안을 추가 확인해야 합니다."
      : item.kind === "SUBSCRIPTION"
        ? "구독·멤버십 경로를 확인했지만 결제·자동갱신·해지 조건을 추가 확인해야 합니다."
        : "해지·환불 경로를 확인했지만 가입과 해지의 단계·가시성 대칭성을 추가 확인해야 합니다.",
    evidenceIds: [item.evidenceId],
  }));
  const hasObservedSubscription = observations.some((item) => item.kind === "SUBSCRIPTION" && item.outcome === "OBSERVED");
  const hasCancellation = observations.some((item) => item.kind === "CANCELLATION");
  if (hasObservedSubscription && !hasCancellation) {
    candidates.push({
      id: "review:surface:cancellation:missing", kind: "SURFACE_FLOW", stage: "surface",
      text: "구독·멤버십 흐름에서 해지 경로를 찾지 못했습니다.",
      reason: "구독 경로는 확인했지만 같은 공개 흐름에서 해지·자동갱신 중단 경로를 찾지 못해 취소·탈퇴 방해 여부를 검토해야 합니다.",
      evidenceIds: [observations.find((item) => item.kind === "SUBSCRIPTION" && item.outcome === "OBSERVED")?.evidenceId ?? "surface:subscription:missing-cancellation"],
    });
  }
  return candidates;
}
