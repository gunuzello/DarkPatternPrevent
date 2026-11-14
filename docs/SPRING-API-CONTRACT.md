# 바로미 Spring API 계약

이 문서는 프론트엔드와 탐색 워커가 Spring 백엔드와 연동할 때 사용하는 현재 계약이다. 공개 인증 계층은 아직 전환 중이므로 아래 헤더는 내부 전환용이며, 최종 서비스 인증으로 교체될 예정이다.

## 공통 규칙

- 모든 상점·진단 요청은 `X-Baromi-Owner`로 소유자 범위를 지정한다.
- 워커 전용 요청은 `X-Baromi-Worker`를 사용한다.
- 워커 토큰과 쇼핑몰 아이디·비밀번호는 응답·로그·Git에 포함하지 않는다.
- 등록 상점과 동일한 HTTPS 호스트의 URL만 진단 대상으로 허용한다.

## 상점

`POST /api/v1/shops`

```json
{ "id": "optional-client-id", "url": "https://shop.example", "consent": true }
```

응답: `201 { "shopId": "...", "url": "..." }`

## 진단 생성·조회

`POST /api/v1/scans`

```json
{
  "id": "optional-client-id",
  "shopId": "shop-id",
  "targetUrl": "https://shop.example/products/item",
  "executionMode": "DYNAMIC",
  "viewport": "DESKTOP",
  "purchasePath": "CART"
}
```

응답: `202 { "scanId": "...", "status": "queued" }`

- `executionMode`: `STATIC` 또는 `DYNAMIC`
- `viewport`: `DESKTOP` 또는 `MOBILE`
- `purchasePath`: `CART` 또는 `DIRECT`
- 동적 진단의 로그인 자격증명은 이 API로 전달하지 않는다. 자격증명은 워커가 접근하는 암호화 보관소에만 둔다.

`GET /api/v1/scans/{scanId}` — 소유자 범위의 단건 상태 조회

`GET /api/v1/scans/shop/{shopId}` — 소유자 범위의 최신순 목록

```json
{
  "shopId": "shop-id",
  "scans": [
    { "scanId": "scan-id", "status": "running", "currentStage": "cart", "createdAt": "2026-11-14T10:00:00Z", "updatedAt": "2026-11-14T10:01:00Z", "startedAt": "2026-11-14T10:00:05Z" }
  ]
}
```

## 워커 큐

- `POST /api/v1/scans/claim` — `queued` 중 가장 오래된 진단을 원자적으로 `running`으로 변경
- `POST /api/v1/scans/recover` — 지정 시각보다 오래 실행 중인 작업을 `failed`로 복구
- `PATCH /api/v1/scans/{scanId}/status` — 워커 상태 콜백

상태 전이:

`queued → running → partial|succeeded|failed|cancelled`

완료 상태에서 `running`으로 되돌리는 역전은 `409 Conflict`로 거부한다.
