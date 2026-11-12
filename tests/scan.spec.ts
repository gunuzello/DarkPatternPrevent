import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { scanDemo } from "../src/scan";

const origin = "http://127.0.0.1:3100";

test("위험 데모에서 두 규칙과 증거를 기록한다", async ({ browser }, info) => {
  const directory = info.outputPath("evidence");
  const report = await scanDemo(browser, origin, "risky", directory);

  expect(report.scanStatus).toBe("COMPLETED");
  expect(report.snapshots.map(({ stage }) => stage)).toEqual(["product", "cart", "checkout"]);
  expect(report.findings.map(({ type, stage }) => [type, stage])).toEqual([
    ["PRESELECTION", "product"],
    ["DRIP_PRICING", "checkout"],
  ]);
  expect(report.findings[1].evidence.map(({ screenshot }) => screenshot)).toEqual(["product.png", "checkout.png"]);
  expect(report.snapshots[1].url).toContain("gift=yes");
  expect(JSON.parse(await readFile(join(directory, "report.json"), "utf8"))).toEqual(report);
  for (const { screenshot } of report.snapshots) {
    expect((await readFile(join(directory, screenshot))).subarray(1, 4).toString()).toBe("PNG");
  }
});

test("정상 데모의 미선택 옵션과 사전 공개 비용은 탐지하지 않는다", async ({ browser }, info) => {
  const report = await scanDemo(browser, origin, "clean", info.outputPath("evidence"));

  expect(report.snapshots[0].options[0].selected).toBe(false);
  expect(report.snapshots.every(({ fees }) => fees[0]?.won === 3000)).toBe(true);
  expect(report.findings).toEqual([]);
});

test("외부 주소를 거부한다", async ({ browser }, info) => {
  await expect(scanDemo(browser, "https://example.invalid", "risky", info.outputPath("evidence")))
    .rejects.toThrow("로컬 서버만 지원합니다");
});

test("정상 데모에서 사용자가 포장을 선택하면 주문서에 선택 금액이 유지된다", async ({ page }) => {
  await page.goto(origin + "/demo/clean/product");
  await page.getByRole("checkbox", { name: /선물 포장/ }).check();
  await page.getByRole("button", { name: "장바구니에 담기" }).click();
  await expect(page.getByText("표시 합계 23,000원")).toBeVisible();
  await page.getByRole("link", { name: "주문서 보기" }).click();
  await expect(page.getByRole("heading", { name: "주문서" })).toBeVisible();
  await expect(page.getByText("표시 합계 23,000원")).toBeVisible();
});

test("주문서 접근 실패 시 앞 단계의 증거와 사전선택 발견을 유지한다", async ({ browser }, info) => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const path = new URL(request.url!, origin).pathname;
    if (path.endsWith("/product")) {
      response.end(`<main data-stage="product">
        <label><input type="checkbox" checked data-option-won="2000">유료 포장</label>
        <form action="/demo/risky/cart"><button>장바구니에 담기</button></form>
      </main>`);
    } else if (path.endsWith("/cart")) {
      response.end(`<main data-stage="cart"><a href="/demo/risky/checkout">주문서 보기</a></main>`);
    } else {
      response.writeHead(403).end("주문서 접근 제한");
    }
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("로컬 테스트 서버 시작 실패");
  try {
    const report = await scanDemo(browser, "http://127.0.0.1:" + address.port, "risky", info.outputPath("evidence"));
    expect(report.scanStatus).toBe("PARTIAL");
    expect(report.snapshots.map(({ stage }) => stage)).toEqual(["product", "cart"]);
    expect(report.findings.map(({ type }) => type)).toEqual(["PRESELECTION"]);
    expect(report.snapshots[0].options[0].bounds.width).toBeGreaterThan(0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("외부 쇼핑몰 형식의 상품을 로컬 증거로 검사하고 후속 단계는 남겨 둔다", async ({ browser }, info) => {
  const { scanPublicShop } = await import("../src/public-scan");
  const visited: string[] = [];
  const target = "https://store.example.com/";
  const report = await scanPublicShop(browser, target, info.outputPath("public"), async () => {}, async (url) => {
    visited.push(url);
    return {
      url,
      html: url === target
        ? '<a href="https://other.example.com/products/no">다른 상점</a><a href="/products/gift">상품 상세</a>'
        : '<button>장바구니에 담기</button><label><input type="checkbox" checked>선물 포장 (+2,000원)</label>',
    };
  });
  expect(visited).toEqual([target, target + "products/gift"]);
  expect(report.scanStatus).toBe("PARTIAL");
  expect(report.snapshots.map(({ stage }) => stage)).toEqual(["product"]);
  expect(report.findings.map(({ type }) => type)).toEqual(["PRESELECTION"]);
});

test("외부 대상 검사는 사설 주소나 혼합 DNS 응답을 거부한다", async () => {
  const { publicAddress } = await import("../src/public-html");
  const { scanTarget } = await import("../src/targets");
  for (const url of ["http://store.example.com", "https://127.0.0.1/", "https://[::1]/", "https://a.local/", "https://store.example.com:9443/", "https://user@store.example.com/"]) {
    expect(scanTarget(url)).toBeNull();
  }
  expect(publicAddress(["8.8.8.8", "169.254.169.254"])).toBeNull();
  expect(publicAddress(["192.168.0.1"])).toBeNull();
  expect(publicAddress(["8.8.8.8"])).toBe("8.8.8.8");
  expect(scanTarget("https://store.example.com/products/1")?.scenario).toBe("public");
});
