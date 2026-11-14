import "dotenv/config";
import { copyFile, cp, mkdir, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { databaseUrl } from "../src/database-url";

async function main() {
  const sourceUrl = databaseUrl();
  if (!sourceUrl?.startsWith("file:")) throw new Error("DATABASE_URL은 SQLite file: URL이어야 합니다.");
  const sourceDb = resolve(sourceUrl.slice("file:".length));
  const sourceEvidence = resolve(process.env.SCAN_RESULTS_DIR ?? join(process.cwd(), "scan-results"));
  const backupRoot = resolve(process.env.BACKUP_DIR ?? join(process.cwd(), "backups"));
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const destination = join(backupRoot, stamp);
  const evidenceRelativeDestination = relative(sourceEvidence, destination);
  if (evidenceRelativeDestination === "" || (!evidenceRelativeDestination.startsWith("..") && !evidenceRelativeDestination.startsWith("../"))) {
    throw new Error("BACKUP_DIR은 SCAN_RESULTS_DIR 바깥 경로여야 합니다.");
  }
  await stat(sourceDb);
  await mkdir(destination, { recursive: true });
  await copyFile(sourceDb, join(destination, basename(sourceDb)));
  await cp(sourceEvidence, join(destination, "scan-results"), { recursive: true, force: true });
  console.log(JSON.stringify({ destination, database: basename(sourceDb), evidence: sourceEvidence }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
