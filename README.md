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

## 브라우저에서 진단

개발 서버와 별도 터미널에서 진단 워커를 실행합니다.

```sh
npm run worker
# 설치된 Chrome으로 실행하려면 PLAYWRIGHT_CHANNEL=chrome npm run worker
```

[쇼핑몰 진단 화면](http://127.0.0.1:3000/scan/new)에서 공개 HTTPS 쇼핑몰 또는 상품 상세 URL을 입력하고 검사 권한을 확인합니다. 진단 요청은 SQLite에 대기열로 저장되고 워커가 한 건씩 처리합니다. 완료 또는 부분 완료 화면에서 근거와 개선 방법을 열고, 같은 URL로 재진단할 수 있습니다. 최초 요청의 브라우저 세션에서만 해당 웹 진단 결과와 스크린샷을 열 수 있습니다.

`DEMO_ORIGIN`을 설정할 경우 웹 서버와 워커에 동일한 로컬 주소를 사용하세요. SQLite와 증거 경로도 두 프로세스에서 공유해야 합니다.

외부 진단은 플랫폼 제한 없이 공개 HTTPS 주소를 받습니다. 첫 화면에서 상품을 찾지 못하면 상품 상세 URL을 입력하세요. 외부 진단은 초기 HTML의 사전선택 위험을 검사하고 부분 완료로 보고합니다. 스크립트로 표시되는 옵션, 로그인, 장바구니·주문서 및 해당 단계의 순차공개 가격책정은 외부 진단 범위에서 빠집니다. 내장 데모는 두 탐지 규칙과 세 구매 단계를 시연할 수 있습니다.

## 탐지 규칙 평가

```sh
npm run evaluate
npm run evaluate -- --text-validation
# 설치된 Chrome으로 실행하려면 PLAYWRIGHT_CHANNEL=chrome npm run evaluate
npm run evaluate -- --text-validation
```

로컬 합성 쇼핑몰 40건을 Playwright로 탐색합니다. 결과는 `scan-results/evaluation/summary.json`에 기록되며, 추가 문구 사례 12건의 결과는 `scan-results/text-validation/summary.json`에 기록됩니다. 각 사례 폴더에는 스크린샷과 진단 JSON이 저장됩니다. [측정 결과와 한계](docs/EVALUATION.md)를 참고하세요.
