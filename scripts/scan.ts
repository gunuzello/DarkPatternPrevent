import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { chromium } from "playwright";
import { databaseUrl } from "../src/database-url";
import type { Scenario } from "../src/demo";
import { scanDemo } from "../src/scan";

async function runBrowserScan(origin: string, scenario: Scenario, directory: string) {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
  try {
    return await scanDemo(browser, origin, scenario, directory);
  } finally {
    await browser.close();
  }
}

async function main() {
  const scenario = process.argv[2];
  if (scenario !== "clean" && scenario !== "risky") {
    throw new Error("사용법: npm run scan -- <clean|risky>");
  }

  const id = randomUUID();
  const directory = join("scan-results", id);
  const reportPath = join(directory, "report.json");
  const origin = "http://127.0.0.1:3000";
  const targetUrl = origin + "/demo/" + scenario + "/product";
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL을 설정하세요. .env.example을 참고하세요.");
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

  try {
    await db.scan.create({ data: { id, scenario, targetUrl, status: "RUNNING" } });
    try {
      const report = await runBrowserScan(origin, scenario, directory);

      await db.scan.update({
        where: { id },
        data: {
          status: report.scanStatus,
          reportPath,
          findings: {
            create: report.findings.map(({ type, status, stage, reason, ruleVersion }) => ({ type, status, stage, reason, ruleVersion })),
          },
        },
      });
      console.log(reportPath);
    } catch (error) {
      await db.scan.update({ where: { id }, data: { status: "FAILED" } });
      throw error;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
