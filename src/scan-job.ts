import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { evidenceDirectory } from "./evidence-directory";
import { db } from "./db";
import { scanDemo } from "./scan";
import { scanPublicShop } from "./public-scan";
import { scanTarget } from "./targets";
import { scanDynamicPublicShop } from "./dynamic-public-scan";
import { startSafeBrowserProxy } from "./safe-browser-proxy";
import { buildPriceLedger } from "./price-ledger";
import { scanComparisonVersion } from "./scan-comparison";
import { decryptCredentials, type TestCredentials } from "./credential-vault";
import { notifySpringScanStatus } from "./spring-status";

export async function runScanJob(id: string, targetUrl: string) {
  const store = db();
  const startedAt = Date.now();
  try {
    const target = scanTarget(targetUrl);
    if (!target) throw new Error("허용 목록에 없는 진단 대상입니다.");
    const requested = await store.scan.findUnique({
      where: { id }, select: { executionMode: true, viewport: true, purchasePath: true, credentialCiphertext: true, shop: { select: { verifiedAt: true } } },
    });
    if (!requested) throw new Error("진단 작업을 찾을 수 없습니다.");
    if (requested.executionMode === "DYNAMIC" && (target.scenario !== "public" || (!requested.shop?.verifiedAt && !requested.credentialCiphertext))) {
      throw new Error("사이트 확인이 없는 동적 진단은 실행할 수 없습니다.");
    }
    let credentials: TestCredentials | undefined;
    if (requested.credentialCiphertext) {
      try { credentials = decryptCredentials(requested.credentialCiphertext); }
      catch (error) {
        await store.scan.update({ where: { id }, data: { credentialCiphertext: null } }).catch(() => undefined);
        throw error;
      }
    }
    const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, timeout: 20_000 });
    const proxy = requested.executionMode === "DYNAMIC"
      ? await startSafeBrowserProxy().catch(async (error) => { await browser.close(); throw error; })
      : null;
    const configuredTimeout = Number(process.env.SCAN_TIMEOUT_MS ?? 280_000);
    const timeoutMs = Number.isFinite(configuredTimeout) ? Math.min(Math.max(configuredTimeout, 30_000), 300_000) : 280_000;
    const timeout = setTimeout(() => void browser.close().catch(() => {}), timeoutMs);
    try {
      const directory = evidenceDirectory(id);
      let progress = 0;
      const onStage = async () => {
        const scan = await store.scan.update({ where: { id }, data: { progress: ++progress } });
        if (scan.cancelRequested) throw new Error("진단 중단");
      };
      let report;
      try {
        report = target.scenario === "public"
          ? requested.executionMode === "DYNAMIC" && proxy
            ? await scanDynamicPublicShop(browser, target.url, directory, proxy.server, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP", onStage, requested.purchasePath === "DIRECT" ? "DIRECT" : "CART", credentials)
            : await scanPublicShop(browser, target.url, directory, onStage, undefined, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP", requested.purchasePath === "DIRECT" ? "DIRECT" : "CART")
          : await scanDemo(browser, new URL(target.url).origin, target.scenario, directory, onStage, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP", requested.purchasePath === "DIRECT" ? "DIRECT" : "CART");
      } catch (error) {
        if (requested.executionMode !== "DYNAMIC") throw error;
        report = {
          comparisonVersion: scanComparisonVersion,
          scanStatus: "PARTIAL" as const, executionMode: "DYNAMIC" as const,
          viewport: requested.viewport === "MOBILE" ? "MOBILE" as const : "DESKTOP" as const,
          purchasePath: requested.purchasePath === "DIRECT" ? "DIRECT" as const : "CART" as const,
          scenario: "public" as const, targetUrl, snapshots: [], interactions: [],
          explorationBlocker: null, networkPriceEvidence: [], priceLedger: buildPriceLedger([]), findings: [],
          collectionFailure: error instanceof Error ? error.message : "동적 구매 흐름을 수집하지 못했습니다.",
          collectionFailureCode: "DYNAMIC_JOURNEY_FAILED" as const,
        };
        await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
      }
      const finished = await store.scan.update({
        where: { id, status: "RUNNING", cancelRequested: false },
        data: {
          status: report.scanStatus,
          durationMs: Date.now() - startedAt,
          reportPath: join(directory, "report.json"),
          findings: { create: report.findings.map(({ type, status, stage, reason, ruleVersion }) => ({
            type, status, stage, reason, ruleVersion,
          })) },
        },
      });
      await store.scan.update({ where: { id }, data: { credentialCiphertext: null } });
      await notifySpringScanStatus(id, report.scanStatus === "COMPLETED" ? "succeeded" : "partial");
      return finished.reportPath;
    } finally {
      clearTimeout(timeout);
      await proxy?.close().catch(() => {});
      await browser.close();
      await store.scan.update({ where: { id }, data: { credentialCiphertext: null } }).catch(() => undefined);
    }
  } catch (error) {
    const cancelled = await store.scan.updateMany({
      where: { id, status: "RUNNING", cancelRequested: true },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count) { await notifySpringScanStatus(id, "cancelled"); return null; }
    await store.scan.updateMany({ where: { id, status: "RUNNING" }, data: { status: "FAILED", durationMs: Date.now() - startedAt } });
    await notifySpringScanStatus(id, "failed");
    throw error;
  }
}
