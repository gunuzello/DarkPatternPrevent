import { chromium } from "playwright";
import { scanTarget } from "../src/targets";
import { safeUrl } from "../src/safe-url";

const targetUrl = process.env.BAROMI_SMOKE_URL;
const username = process.env.BAROMI_SMOKE_USERNAME;
const password = process.env.BAROMI_SMOKE_PASSWORD;

if (!targetUrl || !username || !password) {
  throw new Error("BAROMI_SMOKE_URL, BAROMI_SMOKE_USERNAME, BAROMI_SMOKE_PASSWORD를 설정해야 합니다.");
}
const config = { targetUrl, username, password };
if (!scanTarget(config.targetUrl)) {
  throw new Error("BAROMI_SMOKE_URL은 공개 HTTPS 쇼핑몰 주소여야 합니다.");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
  const page = await browser.newPage({ locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const response = await page.goto(config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (!response?.ok()) throw new Error(`첫 화면 접속 실패: HTTP ${response?.status() ?? "unknown"}`);

  const loginControl = page.getByRole("button", { name: /로그인|sign\s*in|log\s*in/i })
    .or(page.getByRole("link", { name: /로그인|sign\s*in|log\s*in/i }));
  if (await page.locator('input[type="password"]:visible').count() === 0 && await loginControl.count() === 1) {
    await loginControl.click();
  }

  const passwordField = page.locator('input[type="password"]:visible').first();
  if (await passwordField.count() === 0) throw new Error("로그인 비밀번호 입력란을 찾지 못했습니다.");
  const usernameField = page.locator('input[type="email"], input[name*="id" i], input[name*="user" i], input[autocomplete="username"]').filter({ visible: true }).first();
  if (await usernameField.count() === 0) throw new Error("로그인 아이디 입력란을 찾지 못했습니다.");
  await usernameField.fill(config.username);
  await passwordField.fill(config.password);

  let submit = page.locator('form:visible button[type="submit"], form:visible input[type="submit"], button[type="submit"]:visible, input[type="submit"]:visible');
  if (await submit.count() === 0) submit = page.locator('button:visible').filter({ hasText: /로그인|sign\s*in|log\s*in/i });
  if (await submit.count() !== 1) throw new Error(`로그인 제출 버튼을 하나로 확정하지 못했습니다: ${await submit.count()}개`);
  await submit.click();
  await page.waitForTimeout(800);
  if (await page.locator('input[type="password"]:visible').count()) throw new Error("로그인 실패 또는 추가 인증(OTP/CAPTCHA)이 필요합니다.");
  console.log(JSON.stringify({ ok: true, url: safeUrl(page.url()), title: await page.title() }));
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
