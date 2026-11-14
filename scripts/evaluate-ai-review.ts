import { readFile } from "node:fs/promises";

const path = process.env.BAROMI_AI_DATASET_PATH ?? "datasets/ai-review.jsonl";
const allowed = new Set(["LIKELY_RISK", "NEEDS_REVIEW", "LIKELY_BENIGN", "INSUFFICIENT_EVIDENCE"]);

async function main() {
  const lines = (await readFile(path, "utf8").catch(() => "")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as { operatorLabel?: string | null; prediction?: { label?: string; confidence?: number }; usage?: { estimatedCostUsd?: number }; durationMs?: number | null; });
  const labeled = lines.filter((row) => row.operatorLabel && allowed.has(row.operatorLabel));
  const correct = labeled.filter((row) => row.prediction?.label === row.operatorLabel).length;
  const confidence = labeled.length ? labeled.reduce((sum, row) => sum + (row.prediction?.confidence ?? 0), 0) / labeled.length : 0;
  const cost = lines.reduce((sum, row) => sum + (row.usage?.estimatedCostUsd ?? 0), 0);
  const perLabel = Object.fromEntries([...allowed].map((label) => {
    const tp = labeled.filter((row) => row.operatorLabel === label && row.prediction?.label === label).length;
    const predicted = labeled.filter((row) => row.prediction?.label === label).length;
    const actual = labeled.filter((row) => row.operatorLabel === label).length;
    return [label, { precision: predicted ? tp / predicted : null, recall: actual ? tp / actual : null }];
  }));
  const unknown = lines.filter((row) => row.prediction?.label === "INSUFFICIENT_EVIDENCE").length;
  const durations = lines.map((row) => row.durationMs).filter((value): value is number => typeof value === "number");
  console.log(JSON.stringify({ path, rows: lines.length, labeled: labeled.length, accuracy: labeled.length ? correct / labeled.length : null, averageConfidence: confidence, unknownRate: lines.length ? unknown / lines.length : null, perLabel, estimatedCostUsd: cost, averageDurationMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null }));
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
