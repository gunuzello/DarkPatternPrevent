export type ReviewCandidate = { id: string; kind: string; stage: string; text: string; reason: string; evidenceIds: string[] };
export type ReviewEvidence = { evidenceId?: string; stage?: string; url?: string; priceLines?: string[]; options?: unknown[]; precheckedSignals?: unknown[]; surfaceSignals?: unknown[] };
export type AiCandidatePayload = ReviewCandidate & { evidence: ReviewEvidence[] };

const redact = (value: string) => value
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[이메일 가림]")
  .replace(/(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}/g, "[연락처 가림]")
  .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, "[식별번호 가림]");

export function buildAiCandidatePayload(report: { reviewCandidates?: ReviewCandidate[]; snapshots?: ReviewEvidence[] }): AiCandidatePayload[] {
  const evidenceById = new Map((report.snapshots ?? []).map((item) => [item.evidenceId, item]));
  return (report.reviewCandidates ?? []).slice(0, 40).map((item) => ({
    ...item,
    text: redact(item.text).slice(0, 1_000),
    reason: redact(item.reason).slice(0, 500),
    evidence: item.evidenceIds.slice(0, 4).map((id) => {
      const evidence = evidenceById.get(id);
      return evidence ? {
        evidenceId: id, stage: evidence.stage, url: evidence.url,
        priceLines: (evidence.priceLines ?? []).slice(0, 20).map(redact),
        options: (evidence.options ?? []).slice(0, 20),
        precheckedSignals: (evidence.precheckedSignals ?? []).slice(0, 20),
        surfaceSignals: (evidence.surfaceSignals ?? []).slice(0, 20),
      } : { evidenceId: id };
    }),
  }));
}
