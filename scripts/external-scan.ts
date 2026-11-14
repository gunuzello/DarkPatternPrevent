import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "../src/db";
import { encryptCredentials } from "../src/credential-vault";
import { runScanJob } from "../src/scan-job";
import { scanTarget } from "../src/targets";

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

type ScanSummary = { scanStatus: string; reached: string | null; findings: string[] };
async function summarize(reportPath: string): Promise<ScanSummary> {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as {
    scanStatus?: string; snapshots?: { stage: string }[]; findings?: { type: string; stage: string; reason: string }[];
  };
  return {
    scanStatus: report.scanStatus ?? "UNKNOWN",
    reached: report.snapshots?.at(-1)?.stage ?? null,
    findings: (report.findings ?? []).map(({ type, stage, reason }) => `${type}:${stage}:${reason}`).sort(),
  };
}

async function main() {
  const store = db(); const shopId = randomUUID(); const scanId = randomUUID();
  const ownerHash = createHash("sha256").update(`external-smoke:${scanId}`).digest("hex");
  try {
    await store.shop.create({ data: { id: shopId, url: publicTarget.url, ownerHash, verifiedAt: new Date() } });
    await store.scan.create({ data: { id: scanId, shopId, scenario: "public", executionMode: "DYNAMIC", viewport: "DESKTOP", purchasePath: "CART", targetUrl: publicTarget.url, status: "RUNNING", credentialCiphertext: encryptCredentials(credentials) } });
    const reports: ScanSummary[] = [];
    for (let attempt = 0; attempt < repeatCount; attempt++) {
      const reportPath = await runScanJob(scanId, publicTarget.url);
      if (!reportPath) throw new Error("외부 진단 보고서 경로가 없습니다.");
      reports.push(await summarize(reportPath));
      if (attempt + 1 < repeatCount) {
        await store.scan.update({ where: { id: scanId }, data: {
          status: "RUNNING", durationMs: null, reportPath: null, progress: 0, currentStage: null,
          credentialCiphertext: encryptCredentials(credentials),
        } });
      }
    }
    const baseline = JSON.stringify(reports[0]);
    const matchingRuns = reports.filter((report) => JSON.stringify(report) === baseline).length;
    console.log(JSON.stringify({ ok: true, scanId, repeatCount, matchingRuns, repeatability: matchingRuns / reports.length, reports }));
  } finally {
    await store.scan.deleteMany({ where: { id: scanId } }).catch(() => undefined);
    await store.shop.deleteMany({ where: { id: shopId } }).catch(() => undefined);
    await store.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
