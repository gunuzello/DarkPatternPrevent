import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { db } from "../src/db";

const output = process.env.BAROMI_AI_DATASET_PATH ?? "datasets/ai-review.jsonl";

async function main() {
  const store = db();
  try {
    const jobs = await store.aiReview.findMany({
      where: { status: "COMPLETED", resultJson: { not: null } },
      include: { scan: { select: { targetUrl: true, executionMode: true, reportPath: true } } },
      orderBy: { completedAt: "asc" },
    });
    const rows: string[] = [];
    for (const job of jobs) {
      if (!job.scan.reportPath || !job.resultJson) continue;
      const report = JSON.parse(await (await import("node:fs/promises")).readFile(job.scan.reportPath, "utf8")) as { reviewCandidates?: unknown[] };
      const result = JSON.parse(job.resultJson) as { decisions?: unknown[] };
      const decisions = result.decisions ?? [];
      for (const decision of decisions) {
        if (!decision || typeof decision !== "object") continue;
        const candidateId = (decision as { candidateId?: unknown }).candidateId;
        const candidate = (report.reviewCandidates ?? []).find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === candidateId);
        rows.push(JSON.stringify({
          schemaVersion: 1, source: "baromi-ai-review", scanId: job.scanId, candidateId,
          targetHost: new URL(job.scan.targetUrl).hostname, executionMode: job.scan.executionMode,
          candidate, prediction: decision, operatorLabel: null,
          model: job.model, provider: job.provider, usage: job.usageJson ? JSON.parse(job.usageJson) : null,
        }));
      }
    }
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, rows.length ? rows.join("\n") + "\n" : "", "utf8");
    console.log(JSON.stringify({ output, rows: rows.length }));
  } finally { await store.$disconnect(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
