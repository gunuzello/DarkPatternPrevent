import { join } from "node:path";
import { chromium } from "playwright";
import { evidenceDirectory } from "./evidence-directory";
import { db } from "./db";
import { scanDemo } from "./scan";
import { scanPublicShop } from "./public-scan";
import { scanTarget } from "./targets";

export async function runScanJob(id: string, targetUrl: string) {
  const store = db();
  try {
    const target = scanTarget(targetUrl);
    if (!target) throw new Error("허용 목록에 없는 진단 대상입니다.");
    const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, timeout: 20_000 });
    const timeout = setTimeout(() => void browser.close().catch(() => {}), 280_000);
    try {
      const directory = evidenceDirectory(id);
      let progress = 0;
      const onStage = async () => {
        const scan = await store.scan.update({ where: { id }, data: { progress: ++progress } });
        if (scan.cancelRequested) throw new Error("진단 중단");
      };
      const report = target.scenario === "public"
        ? await scanPublicShop(browser, target.url, directory, onStage)
        : await scanDemo(browser, new URL(target.url).origin, target.scenario, directory, onStage);
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
