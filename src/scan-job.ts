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
import { classifyDynamicFailure } from "./scan-failure";

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
    const browserLaunchOptions = {
      timeout: 20_000,
      headless: true,
      // Keep Chromium usable in container/CI workers where /dev/shm is small.
      args: ["--disable-dev-shm-usage"],
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    };
    let browser = await chromium.launch(browserLaunchOptions);
    const proxy = requested.executionMode === "DYNAMIC"
      ? await startSafeBrowserProxy().catch(async (error) => { await browser.close(); throw error; })
      : null;
    const configuredTimeout = Number(process.env.SCAN_TIMEOUT_MS ?? 280_000);
    const timeoutMs = Number.isFinite(configuredTimeout) ? Math.min(Math.max(configuredTimeout, 30_000), 300_000) : 280_000;
    const timeout = setTimeout(() => void browser.close().catch(() => {}), timeoutMs);
    try {
      const directory = evidenceDirectory(id);
      let progress = 0;
      const onStage = async (snapshot: { stage: string }) => {
        const scan = await store.scan.update({ where: { id }, data: { progress: ++progress, currentStage: snapshot.stage } });
        await notifySpringScanStatus(id, "running", snapshot.stage);
        if (scan.cancelRequested) throw new Error("진단 중단");
      };
      let report;
      const scanWithBrowser = (instance: typeof browser) => target.scenario === "public"
        ? requested.executionMode === "DYNAMIC" && proxy
          ? scanDynamicPublicShop(instance, target.url, directory, proxy.server, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP", onStage, requested.purchasePath === "DIRECT" ? "DIRECT" : "CART", credentials)
          : scanPublicShop(instance, target.url, directory, onStage, undefined, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP", requested.purchasePath === "DIRECT" ? "DIRECT" : "CART")
        : scanDemo(instance, new URL(target.url).origin, target.scenario, directory, onStage, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP", requested.purchasePath === "DIRECT" ? "DIRECT" : "CART");
      try {
        let scanPromise: Promise<any> = scanWithBrowser(browser);
        const dynamicTimeoutMs = requested.executionMode === "DYNAMIC"
          ? Math.min(Math.max(Number(process.env.DYNAMIC_SCAN_TIMEOUT_MS ?? 180_000), 30_000), 600_000)
          : 0;
        report = dynamicTimeoutMs
          ? await Promise.race([
            scanPromise,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`동적 전체 탐색 시간 초과(${dynamicTimeoutMs}ms)`)), dynamicTimeoutMs)),
          ])
          : scanPromise;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (requested.executionMode === "STATIC" && /browser|context|Target\.createBrowserContext/i.test(message)) {
          await browser.close().catch(() => {});
          browser = await chromium.launch(browserLaunchOptions);
          report = await scanWithBrowser(browser);
        } else {
        if (requested.executionMode !== "DYNAMIC") throw error;
        const dynamicMessage = message || "동적 구매 흐름을 수집하지 못했습니다.";
        report = {
          comparisonVersion: scanComparisonVersion,
          scanStatus: "PARTIAL" as const, executionMode: "DYNAMIC" as const,
          viewport: requested.viewport === "MOBILE" ? "MOBILE" as const : "DESKTOP" as const,
          purchasePath: requested.purchasePath === "DIRECT" ? "DIRECT" as const : "CART" as const,
          scenario: "public" as const, targetUrl, snapshots: [], interactions: [],
          explorationBlocker: null, networkPriceEvidence: [], priceLedger: buildPriceLedger([]), findings: [],
          collectionFailure: dynamicMessage,
          collectionFailureCode: classifyDynamicFailure(dynamicMessage),
        };
        await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
        }
      }
      const finished = await store.scan.update({
        where: { id, status: "RUNNING", cancelRequested: false },
        data: {
          status: report.scanStatus,
          durationMs: Date.now() - startedAt,
          reportPath: join(directory, "report.json"),
          findings: { create: report.findings.map(({ type, status, stage, reason, ruleVersion }: { type: string; status: string; stage: string; reason: string; ruleVersion: number }) => ({
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
