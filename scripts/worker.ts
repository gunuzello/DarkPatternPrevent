import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/db";
import { runScanJob } from "../src/scan-job";
import { notifySpringScanStatus } from "../src/spring-status";

async function main() {
  const store = db();
  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });

  try {
    while (!stopping) {
      // Reconcile jobs from an interrupted worker once their execution limit has passed.
      await store.$executeRaw`
        UPDATE "Scan" SET status = CASE WHEN "cancelRequested" THEN 'CANCELLED' ELSE 'FAILED' END
        WHERE status = 'RUNNING' AND "startedAt" IS NOT NULL
          AND ("cancelRequested" OR julianday("startedAt") < julianday('now', '-6 minutes'))
      `;
      const [job] = await store.$queryRaw<{ id: string; targetUrl: string }[]>`
        UPDATE "Scan" SET status = 'RUNNING', "startedAt" = CURRENT_TIMESTAMP, "durationMs" = NULL
        WHERE id = (SELECT id FROM "Scan" WHERE status = 'QUEUED' ORDER BY "createdAt", id LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM "Scan" WHERE status = 'RUNNING' AND "startedAt" IS NOT NULL)
        RETURNING id, "targetUrl"
      `;
      if (job) {
        await notifySpringScanStatus(job.id, "running");
        await runScanJob(job.id, job.targetUrl).catch((error) => console.error(job.id, error));
      } else {
        await delay(500);
      }
    }
  } finally {
    await store.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
