# Baromi Spring Boot backend

기존 Next.js API를 단계적으로 이전하기 위한 백엔드 골격이다. 현재는 `/api/v1/health` 계약만 제공하며, 쇼핑몰·진단·보고서 API를 추가하기 전까지 기존 Next.js API와 TypeScript Playwright 워커를 운영 경로로 유지한다.

Gradle 8 이상과 Java 21 이상에서 `gradle bootRun`으로 실행한다. 운영 환경에서는 PostgreSQL 연결 정보(`DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`)를 주입하고 Flyway 마이그레이션을 별도로 활성화한다.
