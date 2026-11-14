import "dotenv/config";
import { access, cp, mkdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

async function exists(path: string) {
  try { await access(path); return true; } catch { return false; }
}

async function main() {
  const snapshot = process.argv[2] && resolve(process.argv[2]);
  const destination = process.argv[3] && resolve(process.argv[3]);
  if (!snapshot || !destination) throw new Error("사용법: npm run restore -- <snapshot> <destination>");
  const sourceDb = resolve(snapshot, "dev.db");
  const sourceEvidence = resolve(snapshot, "scan-results");
  if (!(await exists(sourceDb)) || !(await exists(sourceEvidence))) throw new Error("스냅샷에 DB 또는 증거 디렉터리가 없습니다.");
  if (await exists(destination)) throw new Error("복원 대상이 이미 존재합니다. 새 디렉터리를 지정하세요.");
  await mkdir(destination, { recursive: true });
  await cp(sourceDb, resolve(destination, basename(sourceDb)));
  await cp(sourceEvidence, resolve(destination, "scan-results"), { recursive: true });
  const dbSize = (await stat(resolve(destination, basename(sourceDb)))).size;
  console.log(JSON.stringify({ snapshot, destination, databaseBytes: dbSize }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
