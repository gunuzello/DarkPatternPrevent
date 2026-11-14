import { readFile } from "node:fs/promises";
import { db } from "./db";
import { estimateAiUsage } from "./ai-cost";

type Candidate = { id: string; kind: string; stage: string; text: string; reason: string; evidenceIds: string[] };
type AiDecision = {
  candidateId: string;
  label: "LIKELY_RISK" | "NEEDS_REVIEW" | "LIKELY_BENIGN" | "INSUFFICIENT_EVIDENCE";
  confidence: number;
  rationale: string;
  suggestedRule?: string | null;
};

const reviewSchema = {
  type: "object", additionalProperties: false, required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["candidateId", "label", "confidence", "rationale", "suggestedRule"],
        properties: {
          candidateId: { type: "string" },
          label: { type: "string", enum: ["LIKELY_RISK", "NEEDS_REVIEW", "LIKELY_BENIGN", "INSUFFICIENT_EVIDENCE"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
          suggestedRule: { type: ["string", "null"] },
        },
      },
    },
  },
};

const redact = (value: string) => value
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[이메일 가림]")
  .replace(/(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}/g, "[연락처 가림]")
  .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, "[식별번호 가림]");

function outputText(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (Array.isArray(record.output)) {
    return record.output.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content.flatMap((entry) => entry && typeof entry === "object" && typeof (entry as { text?: unknown }).text === "string" ? [(entry as { text: string }).text] : []) : [];
    }).join("\n");
  }
  return "";
}

function validatedDecisions(value: unknown, candidates: Candidate[]): AiDecision[] {
  const allowed = new Set(candidates.map(({ id }) => id));
  const rows = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as { decisions?: unknown }).decisions) ? (value as { decisions: unknown[] }).decisions : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Partial<AiDecision>;
    if (!item.candidateId || !allowed.has(item.candidateId) || !item.label || !["LIKELY_RISK", "NEEDS_REVIEW", "LIKELY_BENIGN", "INSUFFICIENT_EVIDENCE"].includes(item.label)) return [];
    return [{
      candidateId: item.candidateId,
      label: item.label,
      confidence: Math.min(Math.max(Number(item.confidence) || 0, 0), 1),
      rationale: String(item.rationale ?? "").slice(0, 800),
      suggestedRule: item.suggestedRule ? String(item.suggestedRule).slice(0, 80) : null,
    }];
  });
}

export async function runAiReviewJob(id: string) {
  const store = db();
  try {
    const job = await store.aiReview.findUnique({ where: { id }, include: { scan: { select: { reportPath: true } } } });
    if (!job?.scan.reportPath) throw new Error("기본 진단 보고서가 없습니다.");
    const endpoint = process.env.BAROMI_AI_API_URL;
    const apiKey = process.env.BAROMI_AI_API_KEY;
    const model = process.env.BAROMI_AI_MODEL;
    if (!endpoint || !apiKey || !model) throw new Error("AI 정밀 분석 제공자가 설정되지 않았습니다.");
    const report = JSON.parse(await readFile(job.scan.reportPath, "utf8")) as { reviewCandidates?: Candidate[] };
    const candidates = (report.reviewCandidates ?? []).slice(0, 40).map((item) => ({ ...item, text: redact(item.text).slice(0, 1_000), reason: redact(item.reason).slice(0, 500) }));
    if (!candidates.length) throw new Error("AI로 추가 분석할 검토 후보가 없습니다.");
    await store.aiReview.update({ where: { id }, data: { candidateCount: candidates.length, provider: new URL(endpoint).hostname, model } });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST", signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          input: [
            { role: "system", content: "당신은 쇼핑 인터페이스의 다크패턴 검토 분류기입니다. 제공된 관찰만 판단하고 법률 위반을 단정하지 마세요. JSON만 반환하세요." },
            { role: "user", content: JSON.stringify({ task: "각 후보를 분류", labels: ["LIKELY_RISK", "NEEDS_REVIEW", "LIKELY_BENIGN", "INSUFFICIENT_EVIDENCE"], candidates }) },
          ],
          text: { format: { type: "json_schema", name: "baromi_ai_review", strict: true, schema: reviewSchema } },
        }),
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`AI 제공자 응답 실패(${response.status})`);
    const body = await response.json() as { usage?: { input_tokens?: number; output_tokens?: number } };
    const text = outputText(body);
    const decisions = validatedDecisions(JSON.parse(text), candidates);
    if (!decisions.length) throw new Error("AI 응답에서 유효한 분석 결과를 읽지 못했습니다.");
    const usage = estimateAiUsage({ provider: new URL(endpoint).hostname, model, purpose: "post-report-dark-pattern-review", inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 });
    await store.aiReview.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), resultJson: JSON.stringify({ decisions }), usageJson: JSON.stringify(usage), error: null } });
  } catch (error) {
    await store.aiReview.update({ where: { id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message.slice(0, 500) : "AI 정밀 분석에 실패했습니다." } }).catch(() => undefined);
  } finally { await store.$disconnect(); }
}
