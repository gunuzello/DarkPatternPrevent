import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { decryptCredentials, encryptCredentials } from "../src/credential-vault";

test("테스트 계정은 암호화된 일회성 값으로만 보관한다", () => {
  process.env.BAROMI_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64");
  const ciphertext = encryptCredentials({ username: "test-user", password: "secret-password" });
  expect(ciphertext).not.toContain("secret-password");
  expect(decryptCredentials(ciphertext)).toEqual({ username: "test-user", password: "secret-password" });
});
import { scanDemo } from "../src/scan";
import { paidOptionFromText } from "../src/price-text";
import { detect } from "../src/rules";

const origin = "http://127.0.0.1:3100";

test("위험 데모에서 두 규칙과 증거를 기록한다", async ({ browser }, info) => {
  const directory = info.outputPath("evidence");
  const report = await scanDemo(browser, origin, "risky", directory);

  expect(report.scanStatus).toBe("COMPLETED");
  expect(report.priceLedger.firstPriceExposure.status).toBe("NOT_VERIFIED");
  expect(report.priceLedger.stages.map(({ evidence, verification }) => [evidence.id, verification])).toEqual([
    ["page:product", "SCREEN_ONLY"], ["page:cart", "SCREEN_ONLY"], ["page:checkout", "SCREEN_ONLY"],
  ]);
  expect(report.priceLedger.stages[2].fees.some((fee) => fee.won === 3000 && fee.required)).toBe(true);

  expect(report.snapshots.map(({ stage }) => stage)).toEqual(["product", "cart", "checkout"]);
  expect(report.snapshots.every(({ surfaceSignals }) => Array.isArray(surfaceSignals))).toBe(true);
  expect(report.interactions).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "INITIAL_STATE", stage: "product" }),
    expect.objectContaining({ kind: "PAID_OPTION_TOGGLE", controlLabel: expect.stringContaining("선물 포장") }),
  ]));
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

test("사은품·무료 혜택의 기본 표시는 유료 사전선택으로 오탐하지 않는다", async () => {
  const product = {
    evidenceId: "gift-product", stage: "product" as const, url: "https://shop.test/p/1", screenshot: "",
    priceLines: ["10,000원"], textLines: [], fees: [], options: [{
      label: "무료 사은품 증정", won: 1_000, selected: true,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    }],
  };
  expect(detect([product])).toEqual([]);
});

test("가격이 없어도 자동연장·마케팅 동의 기본 선택을 기록한다", () => {
  const product = {
    stage: "product" as const, url: "https://shop.test/p/1", screenshot: "", priceLines: [], textLines: [], fees: [], options: [],
    precheckedSignals: [{ label: "VIP 멤버십 자동 연장 결제 동의", bounds: { x: 0, y: 0, width: 10, height: 10 } }],
  };
  expect(detect([product]).map(({ type }) => type)).toEqual(["PRESELECTION"]);
});

test("가격비교 방해 표현을 공백 변형과 함께 검토 후보로 기록한다", () => {
  const product = {
    evidenceId: "comparison-product", stage: "product" as const, url: "https://shop.test/p/1", screenshot: "",
    priceLines: [], textLines: ["월 납부 금액과 총 비용은 결제 단계에서 확인하세요"], fees: [], options: [],
  };
  expect(detect([product]).map(({ type }) => type)).toContain("PRICE_COMPARISON_OBSTRUCTION");
});

test("위험 데모의 바로구매 경로는 장바구니를 선택 경로에서 제외한다", async ({ browser }, info) => {
  const report = await scanDemo(browser, origin, "risky", info.outputPath("direct"), undefined, "DESKTOP", "DIRECT");
  expect(report.purchasePath).toBe("DIRECT");
  expect(report.snapshots.map(({ stage }) => stage)).toEqual(["product", "checkout"]);
  expect(report.scanStatus).toBe("COMPLETED");
});

test("모바일 진단은 고정된 모바일 화면 조건을 보고서와 증거에 보존한다", async ({ browser }, info) => {
  const report = await scanDemo(browser, origin, "clean", info.outputPath("mobile"), undefined, "MOBILE");
  expect(report.viewport).toBe("MOBILE");
  expect(report.snapshots[0].screenshotArea?.width).toBe(390);
  expect(report.snapshots[0].screenshotArea?.height).toBeGreaterThanOrEqual(844);
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
        ? '<a href="https://other.example.com/products/no">다른 상점</a><a href="/product/search.html?keyword=">상품검색</a><a href="/products/category-landing">기획전</a><article><a href="/products/gift">상품 상세</a><span>20,000원 · 필수 처리비 3,000원</span></article>'
        : url.endsWith("category-landing")
          ? "<h1>기획전</h1>"
          : '<meta property="og:type" content="product"><meta property="product:price:amount" content="20000"><label><input type="checkbox" checked>선물 포장 (+2,000원)</label>',
    };
  });
  expect(visited).toEqual([target, target + "products/category-landing", target + "products/gift"]);
  expect(report.scanStatus).toBe("PARTIAL");
  expect(report.snapshots.map(({ stage }) => stage)).toEqual(["product"]);
  expect(report.priceLedger.firstPriceExposure).toMatchObject({
    status: "OBSERVED", productUrl: target + "products/gift", screenshot: "listing.png", amounts: [20000, 3000],
    feeMentions: [{ key: "처리비", won: 3000 }],
  });
  expect(report.findings.map(({ type }) => type)).toEqual(["PRESELECTION"]);
});

test("상품 링크가 JSON-LD에만 있어도 구조화된 URL로 상세를 찾는다", async ({ browser }, info) => {
  const { scanPublicShop } = await import("../src/public-scan");
  const target = "https://structured.example.com/";
  const visited: string[] = [];
  const report = await scanPublicShop(browser, target, info.outputPath("jsonld"), async () => {}, async (url) => {
    visited.push(url);
    return { url, html: url === target
      ? '<script type="application/ld+json">[{"@type":"Organization","url":"/about"},{"@type":"ItemList","itemListElement":[{"item":{"url":"/opaque?id=7"}}]}]</script>'
      : '<h1>상품 7</h1><meta property="og:type" content="product"><meta property="product:price:amount" content="12000"><button>장바구니에 담기</button>' };
  });
  expect(visited).toEqual([target, target + "opaque?id=7"]);
  expect(report.snapshots[0].url).toBe(target + "opaque?id=7");
});

test("canonical 상품 URL만 노출된 목록에서도 상세를 확인한다", async ({ browser }, info) => {
  const { scanPublicShop } = await import("../src/public-scan");
  const target = "https://canonical.example.com/";
  const visited: string[] = [];
  const report = await scanPublicShop(browser, target, info.outputPath("canonical"), async () => {}, async (url) => {
    visited.push(url);
    return { url, html: url === target
      ? '<link rel="canonical" href="/opaque-product?sku=9">'
      : '<h1>상품 9</h1><meta property="og:type" content="product"><meta property="product:price:amount" content="9000"><button>구매하기</button>' };
  });
  expect(visited).toEqual([target, target + "opaque-product?sku=9"]);
  expect(report.snapshots[0].url).toBe(target + "opaque-product?sku=9");
});

test("외부 첫 화면을 읽지 못하면 진단 실패 대신 부분 완료와 원인을 기록한다", async ({ browser }, info) => {
  const { scanPublicShop } = await import("../src/public-scan");
  const report = await scanPublicShop(browser, "https://store.example.com/", info.outputPath("unavailable"), async () => {}, async () => {
    throw new Error("network blocked");
  });
  expect(report.scanStatus).toBe("PARTIAL");
  expect(report.snapshots).toEqual([]);
  expect(report.collectionFailure).toContain("첫 화면");
  expect(report.collectionFailureCode).toBe("FETCH_FAILED");
  expect(JSON.parse(await readFile(join(info.outputPath("unavailable"), "report.json"), "utf8"))).toEqual(report);
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
  expect(publicAddress(["2606:4700::1111"])).toBe("2606:4700::1111");
  for (const address of ["::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "fc00::1", "fe80::1", "2002:7f00:1::", "invalid"]) {
    expect(publicAddress(["8.8.8.8", address])).toBeNull();
  }
  expect(scanTarget("https://store.example.com/products/1")?.scenario).toBe("public");
});

test("재진단은 같은 항목의 변화만 비교하고 누락된 단계는 비교 불가로 표시한다", async () => {
  const { compareScans } = await import("../src/scan-comparison");
  const targetUrl = "https://shop.example.com/products/1";
  const before = {
    comparisonVersion: 2, scenario: "public", targetUrl,
    snapshots: [{ stage: "product" as const, url: targetUrl }],
    findings: [{ type: "PRESELECTION" as const, stage: "product" as const, ruleVersion: "3" as const, reason: "유료 포장" }],
  };
  const after = {
    ...before,
    findings: [{ ...before.findings[0], reason: "추가 보증" }],
  };
  expect(compareScans(before, after)).toMatchObject({
    status: "COMPARED", repeated: [], added: after.findings, notObserved: before.findings,
  });
  expect(compareScans(before, { ...after, snapshots: [] }).status).toBe("UNAVAILABLE");
  expect(compareScans(before, { ...after, comparisonVersion: undefined }).status).toBe("UNAVAILABLE");
});

test("동적 탐색은 주문서까지만 이동하고 가격 API의 비식별 숫자만 수집한다", async ({ page }) => {
  const { explorePurchaseJourney } = await import("../src/purchase-journey");
  await page.context().route("https://journey.example/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/cart") return route.fulfill({
      contentType: "application/json", body: JSON.stringify({ cart: { total: 21000 }, email: "private@example.com" }),
    });
    if (path === "/login") return route.fulfill({
      contentType: "text/html; charset=utf-8", body: "<h1>로그인</h1><form><input type='email' /></form>",
    });
    if (path === "/membership") return route.fulfill({
      contentType: "text/html; charset=utf-8", body: "<h1>멤버십</h1><p>무료 체험 후 자동 갱신</p>",
    });
    const html = path === "/product"
      ? `<a href="/login">로그인</a><a href="/membership">멤버십</a><select required><option value="">선택해 주세요</option><option value="regular">기본형</option></select><button onclick="fetch('/api/cart').then(()=>setTimeout(()=>location='/cart',100))">장바구니에 담기</button>`
      : path === "/cart"
        ? `<a href="/checkout">주문하기</a>`
        : `<h1>주문서</h1><button onclick="window.ordered=true">주문 확정</button>`;
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto("https://journey.example/product");
  const visited: string[] = [];
  const result = await explorePurchaseJourney(page, async (stage) => { visited.push(stage); });
  await page.waitForTimeout(50);
  expect(result.reached).toBe("checkout");
  expect(visited).toEqual(["product", "cart", "checkout"]);
  expect(result.observations.map(({ action }) => action.kind)).toContain("REQUIRED_OPTION_SELECTION");
  expect(await page.evaluate(() => (window as typeof window & { ordered?: boolean }).ordered)).toBeUndefined();
  expect(result.network.flatMap(({ values }) => values)).toContainEqual({ path: "$.cart.total", won: 21000 });
  expect(JSON.stringify(result.network)).not.toContain("private@example.com");
  expect(result.surfaceDestinations).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "AUTH", href: "https://journey.example/login" }),
    expect.objectContaining({ kind: "SUBSCRIPTION", href: "https://journey.example/membership" }),
  ]));
  expect(result.surfaceObservations).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "AUTH", outcome: "OBSERVED", status: 200 }),
  ]));
});

test("동적 탐색은 행동 후보가 여러 개면 임의로 클릭하지 않고 이유를 기록한다", async ({ page }) => {
  const { explorePurchaseJourney } = await import("../src/purchase-journey");
  await page.setContent(`<button onclick="window.clicked=true">장바구니에 담기</button><button onclick="window.clicked=true">장바구니에 담기</button>`);
  const result = await explorePurchaseJourney(page);
  expect(result.blocker).toEqual({
    stage: "product", code: "ACTION_AMBIGUOUS", action: "ADD_TO_CART", candidateCount: 2,
  });
  expect(await page.evaluate(() => (window as typeof window & { clicked?: boolean }).clicked)).toBeUndefined();
});

test("동적 탐색은 로그인 화면을 별도 미검사 사유로 기록한다", async ({ page }) => {
  const { explorePurchaseJourney } = await import("../src/purchase-journey");
  await page.setContent("<main><h1>로그인</h1><p>구매하려면 로그인해 주세요.</p></main>");
  const result = await explorePurchaseJourney(page);
  expect(result.blocker).toMatchObject({ code: "LOGIN_REQUIRED", action: "ADD_TO_CART", stage: "product" });
});

test("동적 탐색은 input submit 구매 동작도 의미 이름으로 인식한다", async ({ page }) => {
  const { explorePurchaseJourney } = await import("../src/purchase-journey");
  await page.setContent('<input type="submit" value="장바구니에 담기">');
  const result = await explorePurchaseJourney(page);
  expect(result.blocker?.action).toBe("OPEN_CHECKOUT");
  expect(result.blocker?.code).toBe("ACTION_NOT_FOUND");
});

test("바로구매 경로는 장바구니를 거치지 않고 주문서 직전에서 멈춘다", async ({ page }) => {
  const { explorePurchaseJourney } = await import("../src/purchase-journey");
  await page.route("https://direct.example/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const html = path === "/product"
      ? `<button>장바구니에 담기</button><button onclick="location='/checkout'">바로구매</button>`
      : `<h1>주문서</h1><button>주문 확정</button>`;
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto("https://direct.example/product");
  const visited: string[] = [];
  const result = await explorePurchaseJourney(page, async (stage) => { visited.push(stage); }, "DIRECT");
  expect(result.reached).toBe("checkout");
  expect(visited).toEqual(["product", "checkout"]);
  expect(result.observations.map(({ action }) => action.id)).toContain("product:direct-buy");
  expect(await page.locator("h1").innerText()).toBe("주문서");
});

test("구매 버튼이 일반 안내 화면으로 이동하면 주문서 도달로 과장하지 않는다", async ({ page }) => {
  const { explorePurchaseJourney } = await import("../src/purchase-journey");
  await page.route("https://redirect.example/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const html = path === "/product"
      ? `<button onclick="location='/notice'">바로구매</button>`
      : `<h1>구매 안내</h1><p>재고 문의 후 구매할 수 있습니다.</p>`;
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto("https://redirect.example/product");
  const result = await explorePurchaseJourney(page, undefined, "DIRECT");
  expect(result.reached).toBe("product");
  expect(result.blocker).toMatchObject({ code: "ACTION_FAILED", action: "DIRECT_BUY" });
});

test("경로명이 평범해도 주문·배송 정보와 입력 폼이 있으면 주문서로 확인한다", async ({ page }) => {
  const { explorePurchaseJourney } = await import("../src/purchase-journey");
  await page.route("https://copy.example/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const html = path === "/product"
      ? `<button onclick="location='/basket'">담기</button>`
      : path === "/basket"
        ? `<button onclick="location='/next-step'">결제하기</button>`
        : `<h1>배송 정보</h1><label>이메일<input type="email"></label>`;
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto("https://copy.example/product");
  const result = await explorePurchaseJourney(page);
  expect(result.reached).toBe("checkout");
});

test("사이트 확인 메타 태그는 속성 순서와 따옴표가 달라도 검증하고 위조 값은 거부한다", async () => {
  const { createSiteVerification, matchesVerification, verificationName } = await import("../src/site-verification");
  const verification = createSiteVerification();
  expect(matchesVerification(`<meta content='${verification.token}' data-x="1" name='${verificationName}'>`, verification.hash)).toBe(true);
  expect(matchesVerification(`<meta name="${verificationName}" content="forged">`, verification.hash)).toBe(false);
  expect(matchesVerification(`<script>${verification.token}</script>`, verification.hash)).toBe(false);
});

test("동적 수집 실패는 추가 인증과 일반 탐색 실패를 구분한다", async () => {
  const { classifyDynamicFailure } = await import("../src/scan-failure");
  expect(classifyDynamicFailure("로그인에 실패했거나 추가 인증이 필요합니다.")).toBe("AUTH_CHALLENGE");
  expect(classifyDynamicFailure("page.goto: net::ERR_EMPTY_RESPONSE")).toBe("FETCH_FAILED");
  expect(classifyDynamicFailure("동적 구매 흐름 시간 초과(120000ms)")).toBe("DYNAMIC_JOURNEY_FAILED");
});

test("로그용 URL 정규화는 쿼리와 해시를 제거한다", async () => {
  const { safeUrl } = await import("../src/safe-url");
  expect(safeUrl("https://shop.example/item?session=secret#checkout")).toBe("https://shop.example/item");
});

test("가격 원장은 화면과 API 금액의 일치·불일치를 값별로 보존한다", async () => {
  const { buildPriceLedger } = await import("../src/price-ledger");
  const snapshot = {
    stage: "cart" as const, url: "https://shop.example.com/cart", screenshot: "cart.png",
    priceLines: ["상품 18,000원", "합계 21,000원"], options: [], fees: [],
  };
  const ledger = buildPriceLedger([snapshot], [{
    id: "network:cart:1", stage: "cart", url: "https://shop.example.com/api/cart", capturedAt: new Date().toISOString(),
    values: [{ path: "$.total", won: 21000 }, { path: "$.hiddenFee", won: 3000 }],
  }]);
  expect(ledger.stages[0].verification).toBe("SCREEN_NETWORK_PARTIAL");
  expect(ledger.stages[0].networkValues).toEqual([
    expect.objectContaining({ path: "$.total", matchedScreen: true }),
    expect.objectContaining({ path: "$.hiddenFee", matchedScreen: false }),
  ]);
});

test("일반적인 상품 옵션 문구의 명시적 추가금을 유료 옵션으로 읽는다", async () => {
  expect(paidOptionFromText("각인 서비스 +2,500원")).toBe(2500);
  expect(paidOptionFromText("색상 블랙 (+1,000원)")).toBeNull();
  expect(paidOptionFromText("무료 배송")).toBeNull();
});

test("긴급성·희소성 문구가 함께 보이면 사실 판단이 아닌 검토 신호를 남긴다", async () => {
  const { detect } = await import("../src/rules");
  const product = {
    stage: "product" as const, url: "https://shop.example.com/", screenshot: "product.png",
    priceLines: [], textLines: ["선착순 마감 임박", "마지막 재고 2개"], options: [], fees: [],
  };
  expect(detect([product]).map(({ type }) => type)).toEqual(["URGENCY_SCARCITY"]);
});

test("확장 가이드라인 문구는 단계별 검토 신호와 증거 ID를 남긴다", async () => {
  const product = {
    evidenceId: "evidence:product", stage: "product" as const, url: "https://shop.example.com/", screenshot: "product.png",
    priceLines: ["최저가 19,900원", "정가 29,000원"],
    textLines: ["무료 체험 후 자동 갱신", "혜택을 포기하고 닫기", "광고 포함 추천 상품", "로그인 후 구매 가능"], options: [], fees: [],
  };
  const findings = detect([product]);
  expect(findings.map(({ type }) => type)).toEqual(expect.arrayContaining([
    "HIDDEN_INFO", "FALSE_DISCOUNT", "DISGUISED_AD", "CONFIRM_SHAMING", "FORCED_ACTION", "HIDDEN_SUBSCRIPTION",
  ]));
  expect(findings.every(({ evidenceIds }) => evidenceIds?.includes("evidence:product"))).toBe(true);
});

test("공정위 13개 유형의 추가 신호를 모두 같은 증거에 연결한다", async () => {
  const { detect } = await import("../src/rules");
  const product = {
    evidenceId: "evidence:all-types", stage: "product" as const, url: "https://shop.example.com/", screenshot: "product.png",
    priceLines: [], textLines: [
      "추천 상품 · 구매자 추천", "함께 담기 자동으로 추가", "최저가 상품 품절 임박",
      "아니요, 혜택을 받지 않겠습니다", "구매 버튼은 크게, 거절은 작게", "회원 탈퇴",
      "개당 가격 · 총 비용",
    ], options: [], fees: [],
  };
  const types = detect([product]).map(({ type }) => type);
  expect(types).toEqual(expect.arrayContaining([
    "SNEAKY_CART_ADD", "FALSE_RECOMMENDATION", "BAIT_SELLING", "TRICK_QUESTION",
    "MISDIRECTED_HIERARCHY", "CANCELLATION_OBSTRUCTION", "PRICE_COMPARISON_OBSTRUCTION",
  ]));
  expect(detect([product]).filter(({ type }) => types.includes(type)).every(({ evidenceIds }) => evidenceIds?.includes("evidence:all-types"))).toBe(true);
});

test("모호한 비용 문구는 자동 판정 대신 제한된 검토 후보로 보존한다", async () => {
  const { collectReviewCandidates } = await import("../src/review-candidates");
  const candidates = collectReviewCandidates([{
    evidenceId: "evidence:product", stage: "product", url: "https://shop.example.com/", screenshot: "product.png",
    priceLines: ["배송비 3,000원"], textLines: ["배송비 3,000원"], options: [], fees: [],
  }]);
  expect(candidates).toEqual([expect.objectContaining({ kind: "FEE_SEMANTICS", evidenceIds: ["evidence:product"] })]);
});

test("실패한 해지 경로는 구독이 있어도 미검사 검토 후보로 남긴다", async () => {
  const { collectSurfaceReviewCandidates } = await import("../src/review-candidates");
  const candidates = collectSurfaceReviewCandidates([
    { evidenceId: "surface:subscription:0", kind: "SUBSCRIPTION", url: "https://shop.example.com/membership", status: 200, title: "멤버십", text: "자동 갱신", outcome: "OBSERVED" },
    { evidenceId: "surface:cancellation:1", kind: "CANCELLATION", url: "https://shop.example.com/cancel", status: 403, title: "", text: "", outcome: "FETCH_FAILED" },
  ]);
  expect(candidates.some(({ id }) => id === "review:surface:cancellation:missing")).toBe(true);
});

test("목록에서 이미 같은 필수 비용을 공개했다면 뒤늦은 가격 공개로 오탐하지 않는다", async () => {
  const { detect } = await import("../src/rules");
  const bounds = { x: 0, y: 0, width: 100, height: 20 };
  const product = { stage: "product" as const, url: "https://shop.example.com/product", screenshot: "product.png", priceLines: ["18,000원"], options: [], fees: [] };
  const checkout = {
    stage: "checkout" as const, url: "https://shop.example.com/checkout", screenshot: "checkout.png", priceLines: ["21,000원"], options: [],
    fees: [{ id: "text:처리비", label: "필수 처리비 3,000원", won: 3000, required: true, bounds }],
  };
  expect(detect([product, checkout]).map(({ type }) => type)).toEqual(["DRIP_PRICING"]);
  expect(detect([product, checkout], [{ key: "처리비", won: 3000 }])).toEqual([]);
});

test("브라우저 연결은 검증된 공개 주소로 고정하고 내부망·혼합 DNS·다른 포트를 거부한다", async () => {
  const { safeConnectTarget } = await import("../src/safe-browser-proxy");
  await expect(safeConnectTarget("cdn.shop.example.com:443", async () => ["93.184.216.34"]))
    .resolves.toEqual({ hostname: "cdn.shop.example.com", address: "93.184.216.34", port: 443 });
  for (const [authority, addresses] of [
    ["cdn.shop.example.com:443", ["127.0.0.1"]],
    ["cdn.shop.example.com:443", ["93.184.216.34", "10.0.0.1"]],
    ["cdn.shop.example.com:80", ["93.184.216.34"]],
    ["127.0.0.1:443", ["127.0.0.1"]],
  ] as const) {
    await expect(safeConnectTarget(authority, async () => [...addresses])).rejects.toThrow();
  }
});

test("동적 브라우저 요청은 검증된 쇼핑몰 출처만 허용한다", async () => {
  const { isAllowedDynamicRequest } = await import("../src/dynamic-public-scan");
  expect(isAllowedDynamicRequest("https://shop.example.com/", "https://shop.example.com/assets/app.js")).toBe(true);
  expect(isAllowedDynamicRequest("https://www.shop.example.com/", "https://shop.example.com/api/cart")).toBe(true);
  expect(isAllowedDynamicRequest("https://shop.example.com/", "https://cdn.example.net/app.js")).toBe(false);
  expect(isAllowedDynamicRequest("https://shop.example.com/", "http://shop.example.com/app.js")).toBe(false);
  expect(isAllowedDynamicRequest("https://shop.example.com/", "not-a-url")).toBe(false);
});
