# 바로미 구현 완료 체크리스트

이 문서는 배포 여부가 아니라, 로컬에서 실제로 사용할 수 있는 구조와 기능이 완성됐는지를 판정하는 체크리스트다.

## 구조

- [x] Next.js + TypeScript 웹/API
- [x] Spring Boot + PostgreSQL + Flyway
- [x] TypeScript Playwright 탐색 워커
- [x] SQLite 전환기 저장소와 Spring 미러링
- [x] 프론트 origin을 환경변수로 제한하는 CORS
- [ ] 최종 인증 계층과 owner 헤더 교체
- [ ] Spring을 진단 상태의 단일 권위 저장소로 전환

## 사용자 흐름

- [x] 쇼핑몰 URL과 검사 동의 입력
- [x] 선택적 테스트 계정 입력
- [x] PC/모바일 및 장바구니/바로구매 선택
- [x] 진단 진행 상태와 단계 표시
- [x] 결과 보고서·증거·미검사 범위 표시
- [x] 재진단 비교
- [x] 상점별 진단 이력
- [ ] 프론트가 Spring 상점·진단 API를 직접 사용하는 전환

## 탐색·판정

- [x] 같은 출처 HTTPS 탐색과 SSRF 방어
- [x] 로그인 실패·OTP·CAPTCHA 중단 분류
- [x] 사전선택 규칙
- [x] 순차공개 가격 원장과 화면/API 비교
- [x] 긴급성·희소성 검토 후보
- [x] 스크린샷·DOM·좌표·가격 응답 증거
- [ ] 승인된 외부 테스트몰의 반복 실행 측정

## 검증·운영 준비

- [x] Spring 단위/웹 테스트
- [x] Playwright 36개 회귀 테스트
- [x] TypeScript 타입 검사와 Next 빌드
- [x] npm 런타임 취약점 감사
- [x] Spring liveness/readiness
- [x] 웹/Spring GitHub Actions CI
- [ ] 실제 운영 PostgreSQL 배포 검증
- [ ] 보관·삭제·백업 정책의 운영 실행 검증

## 학습/성능 개선(기능 완료 후)

- [x] 데이터셋·검증 분리 원칙과 가설 문서
- [ ] 라벨링 지침과 합의 데이터셋
- [ ] 상점 그룹 단위 평가 리포트
- [ ] 경량 분류기 실험
- [ ] LLM 호출 비용·호출률 계측
- [ ] DL 필요성 재평가
