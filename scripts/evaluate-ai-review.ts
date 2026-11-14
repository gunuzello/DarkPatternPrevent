import { readFile } from "node:fs/promises";

const path = process.env.BAROMI_AI_DATASET_PATH ?? "datasets/ai-review.jsonl";
const allowed = new Set(["LIKELY_RISK", "NEEDS_REVIEW", "LIKELY_BENIGN", "INSUFFICIENT_EVIDENCE"]);

async function main() {
  const lines = (await readFile(path, "utf8").catch(() => "")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as { operatorLabel?: string | null; prediction?: { label?: string; confidence?: number }; usage?: { estimatedCostUsd?: number }; });
  const labeled = lines.filter((row) => row.operatorLabel && allowed.has(row.operatorLabel));
  const correct = labeled.filter((row) => row.prediction?.label === row.operatorLabel).length;
  const confidence = labeled.length ? labeled.reduce((sum, row) => sum + (row.prediction?.confidence ?? 0), 0) / labeled.length : 0;
  const cost = lines.reduce((sum, row) => sum + (row.usage?.estimatedCostUsd ?? 0), 0);
  console.log(JSON.stringify({ path, rows: lines.length, labeled: labeled.length, accuracy: labeled.length ? correct / labeled.length : null, averageConfidence: confidence, estimatedCostUsd: cost }));
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
