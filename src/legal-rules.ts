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
} satisfies Record<Finding["type"], { title: string; reference: string; source: string; recommendation: string }>;
