import type { ReviewCandidate } from "./review-candidates";

export type ReviewClassification = {
  candidateId: string;
  label: "FEE" | "PAID_OPTION" | "FLOW" | "UNRESOLVED";
  confidence: number;
  method: "dictionary" | "unresolved";
};

/** Cheap, deterministic first pass. Only unresolved rows should reach an AI provider. */
export function classifyReviewCandidates(candidates: ReviewCandidate[]): ReviewClassification[] {
  return candidates.map((candidate) => {
    if (candidate.kind === "FEE_SEMANTICS") return { candidateId: candidate.id, label: "FEE", confidence: 0.86, method: "dictionary" };
    if (candidate.kind === "OPTION_SEMANTICS") return { candidateId: candidate.id, label: "PAID_OPTION", confidence: 0.86, method: "dictionary" };
    if (candidate.kind === "SURFACE_FLOW") return { candidateId: candidate.id, label: "FLOW", confidence: 0.78, method: "dictionary" };
    return { candidateId: candidate.id, label: "UNRESOLVED", confidence: 0, method: "unresolved" };
  });
}
