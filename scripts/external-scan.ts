import { randomUUID, createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { db } from "../src/db";
import { encryptCredentials } from "../src/credential-vault";
import { runScanJob } from "../src/scan-job";
import { scanTarget } from "../src/targets";
import { evidenceDirectory } from "../src/evidence-directory";

const url = process.env.BAROMI_SMOKE_URL;
const username = process.env.BAROMI_SMOKE_USERNAME;
const password = process.env.BAROMI_SMOKE_PASSWORD;
if (!url || !username || !password) throw new Error("BAROMI_SMOKE_URL, BAROMI_SMOKE_USERNAME, BAROMI_SMOKE_PASSWORD를 설정해야 합니다.");
const target = scanTarget(url);
if (!target) throw new Error("BAROMI_SMOKE_URL은 공개 HTTPS 쇼핑몰 주소여야 합니다.");
if (target.scenario !== "public") throw new Error("공개 쇼핑몰만 외부 진단할 수 있습니다.");
const publicTarget = target;
const credentials = { username: username!, password: password! };
const requestedRepeats = Number(process.env.BAROMI_SMOKE_REPEAT ?? "1");
const repeatCount = Number.isFinite(requestedRepeats) ? Math.min(Math.max(Math.floor(requestedRepeats), 1), 3) : 1;
const requestedHardTimeout = Number(process.env.BAROMI_SMOKE_HARD_TIMEOUT_MS ?? "360000");
const hardTimeoutMs = Number.isFinite(requestedHardTimeout) ? Math.min(Math.max(Math.floor(requestedHardTimeout), 30_000), 900_000) : 360_000;

type ScanSummary = {
  scanStatus: string; reached: string | null; collectionFailure: string | null; collectionFailureCode: string | null;
  explorationBlocker: unknown; stageTimingsMs: Record<string, number>; durationMs: number;
  surfaceObservations: { kind: string; outcome: string; source?: string }[]; findings: string[];
};
async function summarize(reportPath: string): Promise<ScanSummary> {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as {
    scanStatus?: string; snapshots?: { stage: string }[]; collectionFailure?: string | null; collectionFailureCode?: string | null;
    explorationBlocker?: unknown; stageTimingsMs?: Record<string, number>; durationMs?: number;
    surfaceObservations?: { kind: string; outcome: string; source?: string }[];
    findings?: { type: string; stage: string; reason: string }[];
  };
  return {
    scanStatus: report.scanStatus ?? "UNKNOWN",
    reached: report.snapshots?.at(-1)?.stage ?? null,
    collectionFailure: report.collectionFailure ?? null,
    collectionFailureCode: report.collectionFailureCode ?? null,
    explorationBlocker: report.explorationBlocker ?? null,
    stageTimingsMs: report.stageTimingsMs ?? {},
    durationMs: report.durationMs ?? 0,
    surfaceObservations: report.surfaceObservations ?? [],
    findings: (report.findings ?? []).map(({ type, stage, reason }) => `${type}:${stage}:${reason}`).sort(),
  };
}

function stableSummary(report: ScanSummary) {
  return JSON.stringify({
    scanStatus: report.scanStatus,
    reached: report.reached,
    collectionFailure: report.collectionFailure,
    collectionFailureCode: report.collectionFailureCode,
    explorationBlocker: report.explorationBlocker,
    surfaceObservations: report.surfaceObservations,
    findings: report.findings,
  });
}

async function main() {
  const hardTimeout = setTimeout(() => {
    console.error(`외부 진단이 ${hardTimeoutMs}ms 제한을 초과해 중단되었습니다.`);
    process.exit(2);
  }, hardTimeoutMs);
  const store = db(); const shopId = randomUUID(); const scanIds: string[] = [];
  const ownerHash = createHash("sha256").update(`external-smoke:${shopId}`).digest("hex");
  try {
    await store.shop.create({ data: { id: shopId, url: publicTarget.url, ownerHash, verifiedAt: new Date() } });
    const reports: ScanSummary[] = [];
    for (let attempt = 0; attempt < repeatCount; attempt++) {
      const scanId = randomUUID(); scanIds.push(scanId);
      await store.scan.create({ data: { id: scanId, shopId, scenario: "public", executionMode: "DYNAMIC", viewport: "DESKTOP", purchasePath: "CART", targetUrl: publicTarget.url, status: "RUNNING", credentialCiphertext: encryptCredentials(credentials) } });
      const reportPath = await runScanJob(scanId, publicTarget.url);
      if (!reportPath) throw new Error("외부 진단 보고서 경로가 없습니다.");
      reports.push(await summarize(reportPath));
      await rm(evidenceDirectory(scanId), { recursive: true, force: true }).catch(() => undefined);
    }
    const baseline = stableSummary(reports[0]);
    const matchingRuns = reports.filter((report) => stableSummary(report) === baseline).length;
    const durations = reports.map((report) => report.durationMs);
    console.log(JSON.stringify({ ok: true, scanIds, repeatCount, matchingRuns, repeatability: matchingRuns / reports.length,
      durationMs: { min: Math.min(...durations), max: Math.max(...durations), average: durations.reduce((sum, value) => sum + value, 0) / durations.length }, reports }));
  } finally {
    clearTimeout(hardTimeout);
    await store.scan.deleteMany({ where: { shopId } }).catch(() => undefined);
    await store.shop.deleteMany({ where: { id: shopId } }).catch(() => undefined);
    await store.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
