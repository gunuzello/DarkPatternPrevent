# 바로미 데이터셋 계약

실제 쇼핑몰 원문·계정·개인정보·스크린샷은 저장소에 커밋하지 않는다. 이 디렉터리에는 스키마, 라벨 지침, 익명화된 메타데이터만 둔다.

권장 레코드 키:

- `shopGroupId`: 쇼핑몰과 스킨을 묶는 그룹 ID
- `flowId`: 구매 경로·뷰포트·실행 회차 ID
- `split`: `development`, `training`, `validation`
- `evidenceIds`: 원본 증거 레코드 ID 목록
- `labels`: 유형별 사람 라벨과 합의 상태
- `collectorVersion`, `ruleVersion`

동일 쇼핑몰의 PC/모바일과 반복 실행은 같은 `shopGroupId`를 사용해 데이터 누수를 방지한다.
