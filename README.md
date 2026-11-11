# DarkPatternPrevent

한국 카페24 쇼핑몰을 운영하는 소상공인을 위한 다크패턴 자동 사전진단 프로젝트입니다. 초기 PoC는 자체 데모몰의 상품 상세, 장바구니, 주문서를 탐색해 유료 옵션 사전선택과 순차공개 가격책정의 위험 신호를 기록합니다.

## 로컬 실행

Node.js 22.12 이상과 npm이 필요합니다.

```sh
npm ci
npx playwright install chromium
cp .env.example .env
npm run db:setup
npm run dev
```

[로컬 데모](http://127.0.0.1:3000)에서 정상·위험 구매 흐름을 직접 확인할 수 있습니다. 개발 서버를 켜 둔 상태에서 다른 터미널로 진단을 실행합니다.

```sh
npm run scan -- risky
npm run scan -- clean
```

명령은 `scan-results/<진단 ID>/report.json` 경로를 출력합니다. 같은 폴더의 `product.png`, `cart.png`, `checkout.png`가 화면 증거입니다. SQLite에는 작업 상태와 발견 항목이 저장됩니다. 위험 데모의 예상 결과는 상품 상세의 사전선택 1건과 주문서의 필수 처리비 공개 1건입니다. 정상 데모의 예상 결과는 0건입니다.

## 검증

```sh
npm run typecheck
npm run build
npm test
```

Playwright 테스트는 별도 포트에서 데모 서버를 시작합니다. 상세 범위와 후속 설계는 [개발 명세](docs/SPEC.md)를 참고하세요.

Chromium 다운로드가 어려운 환경에서 Chrome이 이미 설치되어 있으면 `PLAYWRIGHT_CHANNEL=chrome npm test` 또는 `PLAYWRIGHT_CHANNEL=chrome npm run scan -- risky`로 실행할 수 있습니다.
