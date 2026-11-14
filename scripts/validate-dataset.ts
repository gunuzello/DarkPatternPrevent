import { readFile } from "node:fs/promises";

const file = process.argv[2] ?? "datasets/labels.example.jsonl";
const allowedSplits = new Set(["development", "training", "validation"]);
const allowedLabels = new Set(["RISK", "REVIEW", "NOT_OBSERVED", "NOT_TESTED"]);

async function main() {
const rows = (await readFile(file, "utf8")).split(/\r?\n/).map((line, index) => ({ line, index: index + 1 })).filter(({ line }) => line.trim());
const seenGroups = new Map<string, string>();
for (const { line, index } of rows) {
  let row: any;
  try { row = JSON.parse(line); } catch { throw new Error(`${file}:${index}: JSON 형식이 아닙니다.`); }
  for (const key of ["shopGroupId", "flowId", "split", "evidenceIds", "labels", "collectorVersion", "ruleVersion"]) {
    if (row[key] === undefined) throw new Error(`${file}:${index}: ${key}가 필요합니다.`);
  }
  if (!allowedSplits.has(row.split) || !Array.isArray(row.evidenceIds) || !Array.isArray(row.labels) || !row.evidenceIds.length) {
    throw new Error(`${file}:${index}: split/evidenceIds/labels 형식이 올바르지 않습니다.`);
  }
  for (const label of row.labels) if (!allowedLabels.has(label.status)) throw new Error(`${file}:${index}: 알 수 없는 라벨 상태입니다.`);
  const prior = seenGroups.get(row.shopGroupId);
  if (prior && prior !== row.split) throw new Error(`${file}:${index}: 같은 shopGroupId가 여러 split에 섞였습니다.`);
  seenGroups.set(row.shopGroupId, row.split);
}
console.log(JSON.stringify({ file, records: rows.length, shopGroups: seenGroups.size, valid: true }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
