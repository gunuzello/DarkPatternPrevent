# Baromi Spring Boot backend

기존 Next.js API를 단계적으로 이전하기 위한 백엔드다. 현재 제공 계약은 다음과 같다.

- `GET /api/v1/health`
- `POST /api/v1/shops`, `GET /api/v1/shops/{id}`
- `POST /api/v1/scans`, `GET /api/v1/scans/{id}`
- `PATCH /api/v1/scans/{id}/status` (워커 전용)

상점/진단 생성은 현재 전환기용 `X-Baromi-Owner` 헤더를 사용한다. 최종 공개 인증은 별도 인증 계층으로 교체한다. 워커 상태 콜백은 `BAROMI_WORKER_TOKEN` 환경변수와 `X-Baromi-Worker` 헤더를 사용하며 토큰은 저장소에 커밋하지 않는다.

Gradle 8 이상과 Java 21 이상에서 `gradle bootRun`으로 실행한다. 운영 환경에서는 PostgreSQL 연결 정보(`DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`)를 주입하고 Flyway 마이그레이션을 별도로 활성화한다.
