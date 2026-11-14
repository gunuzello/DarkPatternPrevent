import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { stages, type Stage } from "../src/demo";
import { scanDemo } from "../src/scan";
import { detectionCases, textValidationCases, type ExpectedFinding } from "../tests/fixtures/detection-cases";

type CaseResult = {
  id: string;
  title: string;
  expected: ExpectedFinding[];
  actual: ExpectedFinding[];
  exactMatch: boolean;
  coveredStages: Stage[];
  repeatConsistent: boolean;
  durationMs: number;
};

const rules = [
  "PRESELECTION", "DRIP_PRICING", "URGENCY_SCARCITY", "HIDDEN_INFO", "FALSE_DISCOUNT", "DISGUISED_AD",
  "CONFIRM_SHAMING", "FORCED_ACTION", "HIDDEN_SUBSCRIPTION", "SNEAKY_CART_ADD", "FALSE_RECOMMENDATION",
  "BAIT_SELLING", "TRICK_QUESTION", "MISDIRECTED_HIERARCHY", "CANCELLATION_OBSTRUCTION", "PRICE_COMPARISON_OBSTRUCTION",
] as const;
const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
const keys = (findings: ExpectedFinding[]) => findings.map(({ type, stage }) => type + ":" + stage).sort();
const stableObservation = (scan: Awaited<ReturnType<typeof scanDemo>>) => JSON.stringify({
  stages: scan.snapshots.map(({ stage, url, priceLines, options, fees }) => ({
    stage, url, priceLines,
    options: options.map(({ label, won, selected }) => ({ label, won, selected })),
    fees: fees.map(({ id, label, won, required }) => ({ id, label, won, required })),
  })),
  findings: scan.findings.map(({ type, stage, reason }) => ({ type, stage, reason })),
});

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("사용법: npm run evaluate [-- --text-validation]\n합성 평가를 실행하고 결과를 scan-results에 기록합니다.");
    return;
  }
  const validateText = process.argv.includes("--text-validation");
  const cases = validateText ? textValidationCases : detectionCases;
  const directory = join("scan-results", validateText ? "text-validation" : "evaluation");
  await mkdir(directory, { recursive: true });
  let fixture = cases[0];
  const prefix = "/demo/clean/";
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const stage = stages.find((stage) => prefix + stage === path);
    if (!stage) { response.writeHead(404).end(); return; }
    const next = {
      product: `<form action="${prefix}cart"><button>장바구니에 담기</button></form>`,
      cart: `<a href="${prefix}checkout">주문서 보기</a>`,
      checkout: "",
    };
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
      `<!doctype html><html lang="ko"><title>${fixture.title}</title><main data-stage="${stage}">
      <h1>${fixture.title}</h1>${fixture.pages[stage] ?? ""}${next[stage]}</main></html>`,
    );
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("평가 서버를 시작하지 못했습니다.");
    const origin = "http://127.0.0.1:" + address.port;
    const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
    try {
      const results: CaseResult[] = [];
      for (const testCase of cases) {
        fixture = testCase;
        const start = performance.now();
        const scan = await scanDemo(browser, origin, "clean", join(directory, testCase.id, "run-1"));
        const repeat = await scanDemo(browser, origin, "clean", join(directory, testCase.id, "run-2"));
        const actual = scan.findings.map(({ type, stage }) => ({ type, stage }));
        results.push({
          id: testCase.id, title: testCase.title, expected: testCase.expected, actual,
          exactMatch: JSON.stringify(keys(actual)) === JSON.stringify(keys(testCase.expected)),
          coveredStages: scan.snapshots.map(({ stage }) => stage),
          repeatConsistent: stableObservation(scan) === stableObservation(repeat),
          durationMs: Math.round(performance.now() - start),
        });
      }

      const metrics = rules.map((rule) => {
        const count = (expected: boolean, actual: boolean) => results.filter((result) =>
          result.expected.some(({ type }) => type === rule) === expected &&
          result.actual.some(({ type }) => type === rule) === actual).length;
        const tp = count(true, true), fp = count(false, true), fn = count(true, false), tn = count(false, false);
        return { rule, tp, fp, fn, tn, precision: rate(tp, tp + fp), recall: rate(tp, tp + fn), f1: rate(2 * tp, 2 * tp + fp + fn) };
      });
      const visited = results.reduce((total, item) => total + item.coveredStages.length, 0);
      const totalStages = results.length * stages.length;
      const summary = {
        cases: results.length, exactMatches: results.filter(({ exactMatch }) => exactMatch).length,
        visited, totalStages, reachRate: rate(visited, totalStages),
        untestedRate: rate(totalStages - visited, totalStages),
        repeatableCases: results.filter(({ repeatConsistent }) => repeatConsistent).length,
        repeatabilityRate: rate(results.filter(({ repeatConsistent }) => repeatConsistent).length, results.length),
        meanDurationMs: Math.round(results.reduce((total, item) => total + item.durationMs, 0) / results.length),
        metrics,
      };
      const output = join(directory, "summary.json");
      await writeFile(output, JSON.stringify({ summary, cases: results }, null, 2) + "\n");
      console.table(metrics);
      console.log(`정확 일치 ${summary.exactMatches}/${summary.cases} · 단계 도달 ${visited}/${totalStages} · 반복 일치 ${summary.repeatableCases}/${summary.cases} · 평균 ${summary.meanDurationMs}ms`);
      for (const item of results.filter(({ exactMatch }) => !exactMatch)) console.log(item.id, item.title);
      console.log(output);
      if (summary.exactMatches !== summary.cases || visited !== totalStages || summary.repeatableCases !== summary.cases) process.exitCode = 1;
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
