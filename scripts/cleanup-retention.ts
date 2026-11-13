import "dotenv/config";
import { rm } from "node:fs/promises";
import { db } from "../src/db";
import { evidenceDirectory } from "../src/evidence-directory";

const days = Number(process.env.RETENTION_DAYS ?? 30);
if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("RETENTION_DAYS must be an integer from 1 to 3650");

const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const database = db();
const scans = await database.scan.findMany({
  where: { createdAt: { lt: cutoff }, status: { in: ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] } },
  select: { id: true },
});
for (const scan of scans) {
  await database.scan.delete({ where: { id: scan.id } });
  await rm(evidenceDirectory(scan.id), { recursive: true, force: true }).catch(() => undefined);
}
console.log(JSON.stringify({ deleted: scans.length, retentionDays: days, cutoff: cutoff.toISOString() }));
