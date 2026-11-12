import { join } from "node:path";
import { chromium } from "playwright";
import { evidenceDirectory } from "./evidence-directory";
import { db } from "./db";
import { scanDemo } from "./scan";
import { scanPublicShop } from "./public-scan";
import { scanTarget } from "./targets";
import { scanDynamicPublicShop } from "./dynamic-public-scan";
import { startSafeBrowserProxy } from "./safe-browser-proxy";

export async function runScanJob(id: string, targetUrl: string) {
  const store = db();
  try {
    const target = scanTarget(targetUrl);
    if (!target) throw new Error("허용 목록에 없는 진단 대상입니다.");
    const requested = await store.scan.findUnique({
      where: { id }, select: { executionMode: true, viewport: true, shop: { select: { verifiedAt: true } } },
    });
    if (!requested) throw new Error("진단 작업을 찾을 수 없습니다.");
    if (requested.executionMode === "DYNAMIC" && (target.scenario !== "public" || !requested.shop?.verifiedAt)) {
      throw new Error("사이트 확인이 없는 동적 진단은 실행할 수 없습니다.");
    }
    const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, timeout: 20_000 });
    const proxy = requested.executionMode === "DYNAMIC"
      ? await startSafeBrowserProxy().catch(async (error) => { await browser.close(); throw error; })
      : null;
    const timeout = setTimeout(() => void browser.close().catch(() => {}), 280_000);
    try {
      const directory = evidenceDirectory(id);
      let progress = 0;
      const onStage = async () => {
        const scan = await store.scan.update({ where: { id }, data: { progress: ++progress } });
        if (scan.cancelRequested) throw new Error("진단 중단");
      };
      const report = target.scenario === "public"
        ? requested.executionMode === "DYNAMIC" && proxy
          ? await scanDynamicPublicShop(browser, target.url, directory, proxy.server, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP", onStage)
          : await scanPublicShop(browser, target.url, directory, onStage, undefined, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP")
        : await scanDemo(browser, new URL(target.url).origin, target.scenario, directory, onStage, requested.viewport === "MOBILE" ? "MOBILE" : "DESKTOP");
      const finished = await store.scan.update({
        where: { id, status: "RUNNING", cancelRequested: false },
        data: {
          status: report.scanStatus,
          reportPath: join(directory, "report.json"),
          findings: { create: report.findings.map(({ type, status, stage, reason, ruleVersion }) => ({
            type, status, stage, reason, ruleVersion,
          })) },
        },
      });
      return finished.reportPath;
    } finally {
      clearTimeout(timeout);
      await proxy?.close().catch(() => {});
      await browser.close();
    }
  } catch (error) {
    const cancelled = await store.scan.updateMany({
      where: { id, status: "RUNNING", cancelRequested: true },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count) return null;
    await store.scan.updateMany({ where: { id, status: "RUNNING" }, data: { status: "FAILED" } });
    throw error;
  }
}
