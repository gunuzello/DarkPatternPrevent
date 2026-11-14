import { evidenceIds, type Finding, type Snapshot } from "../rules";

type Rule = {
  type: Finding["type"];
  version: "1";
  title: string;
  pattern: RegExp;
  reason: (line: string) => string;
};

const rules: Rule[] = [
  { type: "SNEAKY_CART_ADD", version: "1", title: "몰래 장바구니 추가 검토", pattern: /함께\s*담|추천\s*상품.*장바구니|자동으로\s*추가|장바구니에\s*담겼|같이\s*구매/i, reason: (line) => `사용자 요청 없이 다른 상품이 함께 담기는지 확인이 필요합니다: ${line}` },
  { type: "FALSE_RECOMMENDATION", version: "1", title: "거짓 추천 검토", pattern: /구매자?\s*추천|베스트\s*리뷰|인기\s*상품|최저가|실시간\s*인기|추천\s*순위/i, reason: (line) => `추천·인기·후기 근거의 실제 대상과 산정 기준을 확인해야 합니다: ${line}` },
  { type: "BAIT_SELLING", version: "1", title: "유인 판매 검토", pattern: /품절|재고\s*없음|현재\s*판매\s*불가|최저가\s*상품/i, reason: (line) => `광고·목록에 노출된 상품을 실제로 구매할 수 있는지 확인해야 합니다: ${line}` },
  { type: "TRICK_QUESTION", version: "1", title: "속임수 질문 검토", pattern: /동의하지\s*않습니다|혜택을\s*받지\s*않|수신\s*거부|광고\s*받지|아니오|아니요/i, reason: (line) => `질문과 선택지의 방향이 소비자 의도와 일치하는지 확인해야 합니다: ${line}` },
  { type: "MISDIRECTED_HIERARCHY", version: "1", title: "잘못된 계층구조 검토", pattern: /작게|연하게|찾기\s*어려|눈에\s*띄지|거절.*숨|동의.*강조|구매.*강조/i, reason: (line) => `중요한 선택지의 시각적 강조와 대안 버튼의 구분을 확인해야 합니다: ${line}` },
  { type: "CANCELLATION_OBSTRUCTION", version: "1", title: "취소·탈퇴 방해 검토", pattern: /회원\s*탈퇴|구독\s*해지|정기\s*결제\s*해지|주문\s*취소|청약\s*철회|해지\s*신청/i, reason: (line) => `취소·탈퇴 경로가 첫 화면에서 쉽게 접근되는지 확인해야 합니다: ${line}` },
  { type: "PRICE_COMPARISON_OBSTRUCTION", version: "1", title: "가격비교 방해 검토", pattern: /월s*납부|연s*납부|단위s*가격|개당|100g당|수수료s*포함|총s*비용/i, reason: (line) => `비교에 필요한 단위·총액·조건이 동일 기준으로 제공되는지 확인해야 합니다: ${line}` },
  { type: "HIDDEN_INFO", version: "1", title: "중요 정보의 축소·누락 검토", pattern: /최저가|부터\s*\d|대표\s*가격|조건\s*별도|세금\s*별도|배송비\s*별도/i, reason: (line) => `구매 조건에 영향을 주는 가격·조건 표현이 확인되었습니다: ${line}` },
  { type: "FALSE_DISCOUNT", version: "1", title: "할인·정가 표시 검토", pattern: /\d+\s*%\s*할인|할인율|정가|특가|세일|SALE|원가/i, reason: (line) => `할인 또는 정가를 강조하는 표현이 확인되었습니다. 실제 기준 가격과 기간을 확인하세요: ${line}` },
  { type: "DISGUISED_AD", version: "1", title: "광고성 콘텐츠 표시 검토", pattern: /광고\s*포함|협찬|추천\s*상품|스폰서|sponsored|ad\b/i, reason: (line) => `광고·추천성 표현이 확인되었습니다. 광고 표기와 일반 콘텐츠의 구분을 확인하세요: ${line}` },
  { type: "CONFIRM_SHAMING", version: "1", title: "거부 선택지 압박 검토", pattern: /아니요,?\s*괜찮아요|혜택을\s*포기|손해|싫어요|받지\s*않겠습니다|계속\s*불편하게/i, reason: (line) => `거부 선택지를 불리하게 표현하는 문구가 확인되었습니다: ${line}` },
  { type: "FORCED_ACTION", version: "1", title: "불필요한 행동 요구 검토", pattern: /회원가입\s*후|로그인\s*후|앱에서만|알림을\s*허용|친구를\s*초대|공유해야/i, reason: (line) => `구매 전에 추가 행동을 요구하는 문구가 확인되었습니다: ${line}` },
  { type: "HIDDEN_SUBSCRIPTION", version: "1", title: "자동 갱신·구독 조건 검토", pattern: /자동\s*갱신|자동\s*연장|무료\s*체험|체험\s*기간|정기\s*결제|구독/i, reason: (line) => `구독 또는 자동 결제 조건이 확인되었습니다. 결제 시점과 해지 방법을 확인하세요: ${line}` },
];

export function detectAdditionalPatterns(snapshot: Snapshot): Finding[] {
  const lines = [...(snapshot.textLines ?? []), ...snapshot.priceLines].map((line) => line.trim()).filter(Boolean);
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const rule of rules) {
    const line = lines.find((candidate) => rule.pattern.test(candidate));
    if (!line || seen.has(rule.type)) continue;
    seen.add(rule.type);
    findings.push({
      type: rule.type, status: "SUSPECTED", ruleVersion: rule.version, stage: snapshot.stage,
      reason: rule.reason(line), evidence: [snapshot], evidenceIds: evidenceIds([snapshot]),
    });
  }
  return findings;
}
