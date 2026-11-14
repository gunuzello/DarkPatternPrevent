# Spring 전환 환경 체크리스트

## 완료

- Java 21 기반 Spring Boot 서비스
- PostgreSQL 연결 설정과 Flyway 마이그레이션
- TypeScript/Playwright 워커 상태 콜백
- PostgreSQL + Spring Docker Compose 구성
- Dockerfile 멀티스테이지 빌드(깨끗한 체크아웃에서도 `docker compose build` 가능)
- GitHub Actions에서 Java 테스트·jar 빌드·Docker 이미지 빌드

## 전환기 운영 원칙

- 기존 Next.js API와 SQLite 워커가 현재 고객 요청의 동작 원장이다.
- Spring은 상점·진단 상태를 병행 기록한다.
- Spring 연동 장애가 기존 진단을 중단시키지 않도록 상태 콜백은 best-effort다.
- `X-Baromi-Owner`는 전환기 내부 계약이며 최종 공개 인증으로 사용하지 않는다.

## 다음 환경 게이트

- 실제 운영 PostgreSQL에서 Flyway V1~V3 적용
- 운영 인증 계층 도입 후 `X-Baromi-Owner` 제거
- Compose 기동 후 `/actuator/health`와 워커 상태 콜백 실환경 확인
