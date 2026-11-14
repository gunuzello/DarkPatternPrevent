# 바로미 서비스 아키텍처 결정

## 결정

바로미는 **Next.js 프론트엔드 + Spring Boot 도메인 API + TypeScript/Playwright 탐색 워커**의 하이브리드 구조로 확장한다. 브라우저 탐색 코드는 현재 검증된 TypeScript 구현을 유지하고, 사용자·조직·권한·진단 이력·과금 같은 업무 API를 Spring Boot로 분리한다.

## 서비스 경계

```text
브라우저
  │ HTTPS
  ▼
Next.js (TypeScript/React)
  │ REST/JSON
  ▼
Spring Boot API (Java)
  ├─ 사용자·조직·권한
  ├─ 상점·진단 요청·보고서 메타데이터
  ├─ 작업 큐 발행
  └─ PostgreSQL
        │ Redis/RabbitMQ 작업 메시지
        ▼
TypeScript Worker (Node.js + Playwright)
  ├─ 로그인·상품·장바구니·주문서 탐색
  ├─ 규칙 엔진
  └─ 증거 저장소(S3 호환)
```

현재 버전은 Next.js Route Handler가 임시 도메인 API와 워커 큐를 함께 제공하며 SQLite를 사용한다. Spring 이전은 기존 API 계약을 먼저 고정한 뒤 단계적으로 진행한다.

## API 계약 원칙

- 진단 생성 요청은 `shopId`, `profile`, `flows`, `viewport`, `purchasePath`를 포함한다.
- 테스트 계정은 동적 진단 요청에서만 허용하고, API 경계를 넘을 때 평문 저장하지 않는다.
- 워커에는 진단 ID와 복호화된 작업 범위만 전달하고, 작업 종료 즉시 계정 값을 폐기한다.
- 진단 상태는 `QUEUED → RUNNING → COMPLETED|PARTIAL|FAILED|CANCELLED`로 제한한다.
- 보고서는 결과 메타데이터와 증거 ID를 분리하고, 개인정보 입력 필드는 마스킹한다.
- API는 주문 확정·결제를 수행하지 않으며 주문서 직전에서 멈춘다.

## 단계적 이전 계획

1. 현재 Next.js API의 요청·응답 스키마와 상태 전이를 계약 테스트로 고정한다.
2. Spring Boot 모듈에 health, shops, scans 조회 API를 추가하고 PostgreSQL 스키마를 준비한다.
3. 진단 생성 작업을 Redis/RabbitMQ 메시지로 발행하고 TypeScript 워커가 소비하도록 만든다.
4. Next.js는 화면과 BFF 역할만 남기고 도메인 API 호출을 Spring으로 전환한다.
5. 기존 SQLite·Next API를 일정 기간 읽기 전용 호환 계층으로 유지한 뒤 제거한다.

## 분리하지 않는 것

- Playwright 탐색 규칙을 Java로 재작성하지 않는다.
- Spring 서비스가 쇼핑몰 페이지를 직접 크롤링하지 않는다.
- 프론트엔드에서 테스트 계정이나 증거 원본을 장기 보관하지 않는다.

## 운영 전제

- 개발·검증 단계에서는 현재 단일 저장소 구조를 유지한다.
- Spring 분리 이후에는 PostgreSQL, Redis/RabbitMQ, S3 호환 저장소를 운영 의존성으로 추가한다.
- 서비스 간 인증은 내부 서비스 토큰 또는 mTLS로 제한하고, 외부 요청은 Spring API만 받는다.
- 전환 완료 기준은 기존 31개 회귀 테스트와 승인 테스트몰 스모크 테스트가 새 경로에서도 동일하게 통과하는 것이다.
