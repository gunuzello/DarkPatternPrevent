import { randomUUID } from "node:crypto";
import { db } from "../src/db";
import { runScanJob } from "../src/scan-job";
import { demoTarget } from "../src/targets";

async function main() {
  const scenario = process.argv[2];
  if (scenario !== "clean" && scenario !== "risky") {
    throw new Error("사용법: npm run scan -- <clean|risky>");
  }
  const store = db();
  const id = randomUUID();
  const targetUrl = demoTarget(scenario);
  try {
    const claimed = await store.$executeRaw`
      INSERT INTO "Scan" (id, scenario, "targetUrl", status, "startedAt")
      SELECT ${id}, ${scenario}, ${targetUrl}, 'RUNNING', CURRENT_TIMESTAMP
      WHERE NOT EXISTS (SELECT 1 FROM "Scan" WHERE status = 'RUNNING' AND "startedAt" IS NOT NULL)
    `;
    if (!claimed) throw new Error("진행 중인 진단이 있습니다. 완료 후 다시 시도하세요.");
    console.log(await runScanJob(id, targetUrl));
  } finally {
    await store.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
