# 바로미 (Baromi)

바로미는 쇼핑몰 운영자가 구매 흐름의 다크패턴 위험 신호를 배포 전에 확인하는 자동 사전진단 서비스입니다. 특정 플랫폼에 종속되지 않는 공통 탐색기를 기반으로 상품 상세, 장바구니, 주문서의 유료 옵션 사전선택과 순차공개 가격책정을 검사합니다. 결과는 법률 판단이 아니라 운영자 검토를 돕는 위험 신호이며, 검사한 범위와 미검사 범위를 함께 표시합니다.

## 로컬 실행

Node.js 22.12 이상과 npm이 필요합니다.

```sh
npm ci
npx playwright install chromium
cp .env.example .env
npm run db:setup
npm run dev
```

웹 진단을 처리하려면 다른 터미널에서 작업기도 실행합니다.

```sh
npm run worker
```

운영 환경에서는 `RETENTION_DAYS`(기본 30일)를 설정하고 `npm run cleanup:retention`을 주기적으로 실행하세요. 종료된 진단의 데이터베이스 레코드와 증거 이미지를 함께 삭제하며, 진행 중인 진단은 삭제하지 않습니다.

동적 브라우저 실행 제한은 `SCAN_TIMEOUT_MS`로 조정할 수 있습니다. 기본값은 280초이며 30초~300초 범위로만 적용됩니다.

배포 상태 확인은 `GET /api/v1/health`를 사용합니다. 정상일 때만 `status: "ok"`를 반환하며, 사용자·상점 데이터는 포함하지 않습니다.

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

외부 진단은 플랫폼 제한 없이 공개 HTTPS 주소를 받습니다. 사이트 소유 확인 전에는 초기 HTML만 검사하고 장바구니·주문서를 미검사로 표시합니다. 서버가 발급한 메타 태그로 소유 확인을 마치면 별도 브라우저 세션에서 동적 구매 흐름을 탐색할 수 있습니다. 공개 주소로 검증된 대상에만 연결하며 주문 확정과 결제는 실행하지 않습니다. 실제 탐색 성능은 권한을 받은 테스트몰에서 별도로 검증해야 합니다.

상품 상세 발견은 특정 플랫폼 URL 규칙에 의존하지 않습니다. 공개 화면의 일반 링크, `Product`·`ItemList` JSON-LD, canonical/OG 메타데이터를 후보로 모은 뒤 가격·상품·구매 행동 신호를 확인해 채택합니다. 링크가 없는 client-rendered SPA는 같은 출처의 안전한 렌더링 폴백으로 확인하며, 후보가 여러 개이면 임의의 상품을 선택하지 않고 미검사 사유를 남깁니다.

## 탐지 규칙 평가

```sh
npm run evaluate
npm run evaluate -- --text-validation
# 설치된 Chrome으로 실행하려면 PLAYWRIGHT_CHANNEL=chrome npm run evaluate
```

로컬 합성 쇼핑몰 40건을 Playwright로 탐색합니다. 결과는 `scan-results/evaluation/summary.json`에 기록되며, 추가 문구 변형·정상 대조군 16건의 결과는 `scan-results/text-validation/summary.json`에 기록됩니다. 각 사례 폴더에는 스크린샷과 진단 JSON이 저장됩니다. [측정 결과와 한계](docs/EVALUATION.md)를 참고하세요.
