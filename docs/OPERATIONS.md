# 바로미 운영 검증 절차

## PostgreSQL staging 기동

실제 비밀번호는 파일이나 Git에 저장하지 않는다.

```bash
export BAROMI_POSTGRES_PASSWORD='staging-only-secret'
export BAROMI_WORKER_TOKEN='staging-only-worker-token'
export BAROMI_REPORT_RETENTION_DAYS=30
export BAROMI_RETENTION_CLEANUP_MS=3600000
docker compose -f docker-compose.spring.yml up --build -d
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS http://127.0.0.1:8080/api/v1/health/readiness
```

성공 기준은 `health.status=ok`, `readiness.status=ready`, Flyway 최신 버전 적용이다. 운영 DB에서는 `select version, success from flyway_schema_history order by installed_rank desc limit 1;`로 확인한다.

## 보관·삭제 확인

`BAROMI_REPORT_RETENTION_DAYS`가 지난 보고서는 `report_json`과 만료 시각이 비워지고, 상태·상점·생성 시각 메타데이터는 남는다. 결제 정보·비밀번호·워커 토큰은 보고서에 저장하지 않는다.

## 승인 테스트몰 반복 검증

승인받은 계정만 환경변수로 전달한다. 결제·주문 확정·회원 탈퇴·구독 해지는 누르지 않는다.

```bash
BAROMI_SMOKE_URL='https://approved-shop.example' \
BAROMI_SMOKE_USERNAME='test-account' \
BAROMI_SMOKE_PASSWORD='test-password' \
BAROMI_SMOKE_REPEAT=2 \
npm run scan:external
```

모바일·바로구매 경로는 `BAROMI_SMOKE_VIEWPORT=MOBILE` 또는 `BAROMI_SMOKE_PURCHASE_PATH=DIRECT`를 추가해 같은 승인 계정으로 별도 측정한다.

성공 기준은 반복 결과 일치율, 도달 단계, 미검사 원인, 증거 ID가 보고서에 남는 것이다. 실행 후 외부 스캔 스크립트는 테스트 보고서와 자격증명 관련 임시 데이터를 삭제한다.

## 비용 계측

규칙 엔진만 실행한 진단은 AI 호출 0회·추정 비용 0으로 기록한다. 분류기나 외부 모델을 연결할 때만 `BAROMI_AI_INPUT_USD_PER_MILLION`, `BAROMI_AI_OUTPUT_USD_PER_MILLION`을 설정하고 호출별 토큰·모델·목적을 함께 기록한다. 선택적으로 `BAROMI_AI_MAX_COST_USD`를 설정하면 예상 비용이 상한을 넘는 AI 결과를 완료로 저장하지 않고 실패·비용 정보와 함께 남긴다.
