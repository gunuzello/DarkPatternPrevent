import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3100";
const riskyUrl = origin + "/demo/risky/product";
let worker: ChildProcess | undefined;

test.afterEach(async () => {
  if (!worker?.pid || worker.exitCode !== null) return;
  const child = worker;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await exited;
});

test("URL과 동의를 검증하고 대기 중인 진단을 중단한다", async ({ request }) => {
  const api = origin + "/api/v1/";
  expect((await request.get(api + "health")).status()).toBe(200);
  for (const data of [{ url: riskyUrl, consent: false }, { url: "https://example.invalid", consent: true }]) {
    expect((await request.post(api + "shops", { data })).status()).toBe(400);
  }
  const external = await request.post(api + "shops", {
    data: { url: "https://store.example.com/products/gift", consent: true },
  });
  expect(external.status()).toBe(201);
  const externalShop = await external.json();
  expect(externalShop.verification.metaTag).toContain('name="baromi-site-verification"');
  expect(externalShop.verification.token).toHaveLength(32);
  const unverifiedDynamic = await request.post(api + "scans", { data: {
    shopId: externalShop.shopId, profile: "DYNAMIC", flows: ["PURCHASE"], productLimit: 1, viewport: "DESKTOP",
  } });
  expect(unverifiedDynamic.status()).toBe(409);
  const shop = await (await request.post(api + "shops", { data: { url: riskyUrl, consent: true } })).json();
  expect(shop.verification).toBeNull();
  const verified = await request.post(api + "shops/" + shop.shopId + "/verify", { data: {} });
  expect(verified.status()).toBe(200);
  expect((await verified.json()).verified).toBe(true);
  expect((await request.get(api + "shops/" + shop.shopId)).status()).toBe(200);
  const submitted = await request.post(api + "scans", { data: {
    shopId: shop.shopId, profile: "CONTEST", flows: ["PURCHASE"], productLimit: 1, viewport: "DESKTOP",
  } });
  expect(submitted.status()).toBe(202);
  const scan = await submitted.json();
  expect(scan.status).toBe("QUEUED");
  const duplicate = await request.post(api + "scans", { data: {
    shopId: shop.shopId, profile: "CONTEST", flows: ["PURCHASE"], productLimit: 1, viewport: "DESKTOP",
  } });
  expect(duplicate.status()).toBe(202);
  expect(await duplicate.json()).toMatchObject({ scanId: scan.scanId, deduplicated: true });
  expect((await request.post(api + "scans/" + scan.scanId + "/cancel", { data: {} })).status()).toBe(200);
  const status = await (await request.get(api + "scans/" + scan.scanId)).json();
  expect(status.status).toBe("CANCELLED");
  expect(status.summary.notTested).toBe(3);
  expect((await request.get(api + "shops/" + shop.shopId + "/scans")).json()).resolves.toEqual([
    expect.objectContaining({ scanId: scan.scanId, status: "CANCELLED", purchasePath: "CART" }),
  ]);
  expect((await request.delete(api + "shops/" + shop.shopId)).status()).toBe(200);
  expect((await request.get(api + "shops/" + shop.shopId)).status()).toBe(404);
});

test("웹에서 진단하고 증거를 확인한 후 같은 조건으로 재진단한다", async ({ page, playwright }) => {
  worker = spawn(process.execPath, ["--import", "tsx", "scripts/worker.ts"], {
    env: process.env,
    stdio: "inherit",
  });
  await page.goto(origin);
  await page.getByRole("link", { name: "쇼핑몰 진단 시작" }).click();
  await page.getByRole("button", { name: "위험 데모 URL 사용" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "진단 시작" }).click();
  await page.getByRole("link", { name: "진단 결과 보기" }).click({ timeout: 20_000 });
  await page.waitForURL("**/report/*");
  const reportUrl = page.url();
  const baselineScanId = new URL(reportUrl).pathname.split("/").at(-1);
  const downloadResponse = await page.request.get(origin + "/api/v1/scans/" + baselineScanId + "/report?download=1");
  expect(downloadResponse.status()).toBe(200);
  expect(downloadResponse.headers()["content-disposition"]).toContain(`baromi-${baselineScanId}.json`);
  const differentShop = await page.request.post(origin + "/api/v1/shops", {
    data: { url: riskyUrl, consent: true },
  });
  const { shopId } = await differentShop.json();
  const wrongBaseline = await page.request.post(origin + "/api/v1/scans", { data: {
    shopId, baselineScanId, profile: "CONTEST", flows: ["PURCHASE"], productLimit: 1, viewport: "DESKTOP",
  } });
  expect(wrongBaseline.status()).toBe(404);
  await expect(page.getByRole("link", { name: "특정 옵션의 사전선택" })).toBeVisible();
  await Promise.all([
    page.waitForURL("**/report/*/*"),
    page.getByRole("link", { name: "순차공개 가격책정" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "순차공개 가격책정" })).toBeVisible();
  await expect(page.getByText("근거 ID ·")).toBeVisible();
  await expect(page.getByRole("link", { name: /제21조의2/ })).toBeVisible();
  const image = page.getByRole("img", { name: "주문서 진단 화면" });
  await expect(page.getByRole("img", { name: "위험 신호 위치" })).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  const evidence = (await image.getAttribute("src"))!;
  const anonymous = await playwright.request.newContext();
  try {
    expect((await anonymous.get(origin + evidence)).status()).toBe(404);
  } finally {
    await anonymous.dispose();
  }
  await page.getByRole("link", { name: "진단 결과로 돌아가기" }).click();
  await page.getByRole("button", { name: "같은 조건으로 재진단" }).click();
  await page.getByRole("link", { name: "진단 결과 보기" }).click({ timeout: 20_000 });
  await page.waitForURL("**/report/*");
  expect(page.url()).not.toBe(reportUrl);
  await expect(page.getByRole("heading", { name: "재진단 비교" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "재발견 2건" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "이번에 미발견 0건" })).toBeVisible();
  await expect(page.getByRole("link", { name: "기준 보고서 보기" })).toHaveAttribute("href", new URL(reportUrl).pathname);
  await expect(page.getByRole("link", { name: "순차공개 가격책정" })).toBeVisible();
});
