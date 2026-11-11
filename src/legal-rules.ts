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
} satisfies Record<Finding["type"], { title: string; reference: string; source: string; recommendation: string }>;
