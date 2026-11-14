import type { Finding } from "./rules";

const source = "https://law.go.kr/LSW/lsRvsDocListP.do?lsId=009318";

export const legalRules = {
  PRESELECTION: {
    title: "특정 옵션의 사전선택",
    reference: "전자상거래법 제21조의2제1항제2호",
    source,
    recommendation: "유료 포장 옵션의 기본 선택을 해제하고 구매자가 직접 선택하게 하세요.",
  },
  DRIP_PRICING: {
    title: "순차공개 가격책정",
    reference: "전자상거래법 제21조의2제1항제1호",
    source,
    recommendation: "첫 가격 표시 화면에 필수 처리비를 포함한 총금액을 표시하고 예외 사유가 있는 경우 고지 요건을 확인하세요.",
  },
  URGENCY_SCARCITY: {
    title: "긴급성·희소성 표현 검토 필요",
    reference: "공정위 다크패턴 자율관리 가이드라인 · 거짓·과장 및 거짓 긴급성 관련 항목",
    source: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156784349",
    recommendation: "카운트다운·재고·동시 접속자 수가 실제 근거와 일치하는지 확인하고, 근거 없는 압박성 표현은 제거하세요.",
  },
  HIDDEN_INFO: { title: "중요 정보의 축소·누락", reference: "공정위 온라인 다크패턴 자율관리 가이드라인 · 숨은 정보", source: "https://tf2.ftc.go.kr/DATA/download/www/cts304_2023_file.pdf", recommendation: "대표 가격만 보여주지 말고 구매 조건과 추가 비용을 같은 화면에서 확인할 수 있게 표시하세요." },
  FALSE_DISCOUNT: { title: "할인·정가 표시 검토", reference: "공정위 온라인 다크패턴 자율관리 가이드라인 · 거짓 할인", source: "https://tf2.ftc.go.kr/DATA/download/www/cts304_2023_file.pdf", recommendation: "할인 기준 가격, 적용 조건, 기간을 소비자가 확인할 수 있게 표시하세요." },
  DISGUISED_AD: { title: "위장 광고 검토", reference: "공정위 온라인 다크패턴 자율관리 가이드라인 · 위장 광고", source: "https://tf2.ftc.go.kr/DATA/download/www/cts304_2023_file.pdf", recommendation: "광고·협찬·추천 콘텐츠임을 일반 콘텐츠와 구분되게 표시하세요." },
  CONFIRM_SHAMING: { title: "거부 선택지 압박 검토", reference: "공정위 온라인 다크패턴 자율관리 가이드라인 · 감정적 압박", source: "https://tf2.ftc.go.kr/DATA/download/www/cts304_2023_file.pdf", recommendation: "거부 선택지를 불리하거나 모욕적으로 표현하지 마세요." },
  FORCED_ACTION: { title: "불필요한 행동 요구 검토", reference: "공정위 온라인 다크패턴 자율관리 가이드라인 · 강제 행동", source: "https://tf2.ftc.go.kr/DATA/download/www/cts304_2023_file.pdf", recommendation: "구매와 직접 관련 없는 가입·공유·알림 허용을 필수 단계로 만들지 마세요." },
  HIDDEN_SUBSCRIPTION: { title: "자동 갱신·구독 조건 검토", reference: "공정위 온라인 다크패턴 자율관리 가이드라인 · 숨은 갱신", source: "https://tf2.ftc.go.kr/DATA/download/www/cts304_2023_file.pdf", recommendation: "무료 체험 종료 후 결제와 자동 갱신 조건을 결제 전에 명확히 알리세요." },
  SNEAKY_CART_ADD: { title: "몰래 장바구니 추가", reference: "공정위 온라인 인터페이스 운영 가이드라인 · 몰래 장바구니 추가", source: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156784349", recommendation: "사용자가 요청하지 않은 상품·서비스를 장바구니에 추가하지 마세요." },
  FALSE_RECOMMENDATION: { title: "거짓 추천", reference: "공정위 온라인 인터페이스 운영 가이드라인 · 거짓 추천", source: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156784349", recommendation: "추천·인기·후기 근거와 대상 상품을 실제 데이터와 일치시키세요." },
  BAIT_SELLING: { title: "유인 판매", reference: "공정위 온라인 인터페이스 운영 가이드라인 · 유인 판매", source: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156784349", recommendation: "유인에 사용한 상품을 실제로 구매할 수 있게 하고 재고·판매 조건을 정확히 표시하세요." },
  TRICK_QUESTION: { title: "속임수 질문", reference: "공정위 온라인 인터페이스 운영 가이드라인 · 속임수 질문", source: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156784349", recommendation: "질문 문구와 선택지의 의미를 명확히 하고 의도와 반대되는 선택을 유도하지 마세요." },
  MISDIRECTED_HIERARCHY: { title: "잘못된 계층구조", reference: "공정위 온라인 인터페이스 운영 가이드라인 · 잘못된 계층구조", source: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156784349", recommendation: "구매·동의 버튼만 과도하게 강조하거나 거부·취소 선택지를 숨기지 마세요." },
  CANCELLATION_OBSTRUCTION: { title: "취소·탈퇴 등의 방해", reference: "공정위 온라인 인터페이스 운영 가이드라인 · 취소·탈퇴 등의 방해", source: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156784349", recommendation: "마이페이지 등에서 취소·탈퇴 경로를 쉽게 찾고 가입보다 어렵게 만들지 마세요." },
  PRICE_COMPARISON_OBSTRUCTION: { title: "가격비교 방해", reference: "공정위 온라인 인터페이스 운영 가이드라인 · 가격비교 방해", source: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156784349", recommendation: "단위 가격·총액·조건을 동일한 기준으로 비교할 수 있게 표시하세요." },
} satisfies Record<Finding["type"], { title: string; reference: string; source: string; recommendation: string }>;
