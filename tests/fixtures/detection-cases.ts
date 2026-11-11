import type { Stage } from "../../src/demo";
import type { Finding } from "../../src/rules";

export type ExpectedFinding = Pick<Finding, "type" | "stage">;
type DetectionCase = {
  id: string;
  title: string;
  expected: ExpectedFinding[];
  pages: Partial<Record<Stage, string>>;
};

const preselection: ExpectedFinding = { type: "PRESELECTION", stage: "product" };
const drip = (stage: Stage): ExpectedFinding => ({ type: "DRIP_PRICING", stage });

const checkbox = (label: string, attributes: string) =>
  `<label><input type="checkbox" ${attributes}> ${label}</label>`;
const optionCase = (id: number, title: string, html: string, expected = false): DetectionCase => ({
  id: "DP01-" + id, title, expected: expected ? [preselection] : [], pages: { product: html },
});

const fee = (id: string, amount: number, label: string, required = true) =>
  `<p data-fee-id="${id}" data-won="${amount}" data-required="${required}">${label} ${amount.toLocaleString("ko-KR")}원</p>`;
const priceCase = (
  id: number, title: string, pages: DetectionCase["pages"], expected: ExpectedFinding[] = [],
): DetectionCase => ({ id: "DP02-" + id, title, pages, expected });

export const detectionCases = [
  optionCase(1, "유료 선물 포장 기본 체크", checkbox("선물 포장 (+2,000원)", 'checked data-option-won="2000"'), true),
  optionCase(2, "추가 보증 기본 체크", checkbox("1년 보증 연장", 'checked data-option-won="5000"'), true),
  optionCase(3, "라벨이 분리된 유료 체크박스", '<input id="gift" type="checkbox" checked data-option-won="900"><label for="gift">리본 포장</label>', true),
  optionCase(4, "기본 체크된 유료 라디오", '<label><input type="radio" name="pack" checked data-option-won="2000"> 고급 포장</label>', true),
  optionCase(5, "기본 선택된 유료 셀렉트 항목", '<label>포장<select><option>포장 안 함</option><option selected data-option-won="3000">선물 포장</option></select></label>', true),
  optionCase(6, "기본 활성화된 유료 스위치", '<button type="button" role="switch" aria-checked="true" data-option-won="3000">파손 보장</button>', true),
  optionCase(7, "별도 상품 체크박스", checkbox("보관 파우치 추가", 'checked data-option-won="4500"'), true),
  optionCase(8, "유료 옵션과 미선택 항목이 함께 표시", checkbox("메시지 카드", 'checked data-option-won="500"') + checkbox("리본", 'data-option-won="700"'), true),
  optionCase(9, "데모 속성 없이 기본 체크된 유료 포장", checkbox("유료 선물 포장 (+2,000원)", "checked"), true),
  optionCase(10, "데모 속성 없이 기본 체크된 유료 보증", checkbox("추가 보증 (+5,000원)", "checked"), true),
  optionCase(11, "유료 포장 기본 미선택", checkbox("선물 포장 (+2,000원)", 'data-option-won="2000"')),
  optionCase(12, "이전 배송지 기본 선택", checkbox("이전 배송지 사용", "checked")),
  optionCase(13, "무료 증정품", checkbox("무료 사은품 받기", 'checked data-option-won="0"')),
  optionCase(14, "배송 요청사항 유지", checkbox("배송 메시지 저장", "checked")),
  optionCase(15, "숨겨진 체크박스", '<div hidden>' + checkbox("유료 포장", 'checked data-option-won="2000"') + "</div>"),
  optionCase(16, "할인 적용 선택", checkbox("할인 적용", 'checked data-option-won="-1000"')),
  optionCase(17, "미선택 유료 라디오", '<label><input type="radio" name="pack" data-option-won="2000"> 고급 포장</label>'),
  optionCase(18, "기본 선택이 무료인 셀렉트", '<label>포장<select><option selected>포장 안 함</option><option data-option-won="3000">선물 포장</option></select></label>'),
  optionCase(19, "비활성 상태의 유료 스위치", '<button type="button" role="switch" aria-checked="false" data-option-won="3000">파손 보장</button>'),
  optionCase(20, "안내 확인 체크박스", checkbox("배송 안내 확인", "checked")),
  priceCase(1, "주문서에서 처음 보이는 필수 처리비", { checkout: fee("handling", 3000, "필수 처리비") }, [drip("checkout")]),
  priceCase(2, "장바구니에서 처음 보이는 필수 포장비", { cart: fee("pack", 2000, "필수 포장비") }, [drip("cart")]),
  priceCase(3, "뒤늦게 표시된 비용을 다음 단계에서도 표시", { cart: fee("service", 1000, "서비스비"), checkout: fee("service", 1000, "서비스비") }, [drip("cart")]),
  priceCase(4, "두 종류의 필수 비용이 각각 뒤늦게 표시", { cart: fee("handling", 500, "처리비"), checkout: fee("pack", 1500, "포장비") }, [drip("cart"), drip("checkout")]),
  priceCase(5, "첫 화면에서 숨겨진 필수 비용", { product: '<div hidden>' + fee("fee", 1000, "수수료") + '</div>', checkout: fee("fee", 1000, "수수료") }, [drip("checkout")]),
  priceCase(6, "0원으로 표시됐던 비용이 필수 유료로 전환", { product: fee("pack", 0, "포장"), checkout: fee("pack", 1500, "필수 포장") }, [drip("checkout")]),
  priceCase(7, "선택 비용으로 고지한 항목이 필수 비용으로 전환", { product: fee("pack", 1500, "선택 포장", false), checkout: fee("pack", 1500, "필수 포장") }, [drip("checkout")]),
  priceCase(8, "한 비용은 공개됐고 다른 비용은 뒤늦게 표시", { product: fee("pack", 1500, "포장"), checkout: fee("pack", 1500, "포장") + fee("handling", 2000, "필수 처리비") }, [drip("checkout")]),
  priceCase(9, "데모 속성이 없는 주문서 필수 처리비", { checkout: "<p>필수 처리비 3,000원</p>" }, [drip("checkout")]),
  priceCase(10, "데모 속성이 없는 장바구니 필수 포장비", { cart: "<p>필수 포장비 2,000원</p>" }, [drip("cart")]),
  priceCase(11, "첫 화면부터 필수 비용 고지", { product: fee("handling", 3000, "필수 처리비"), checkout: fee("handling", 3000, "필수 처리비") }),
  priceCase(12, "장바구니 선택 포장 비용", { cart: fee("pack", 2000, "선택 포장", false) }),
  priceCase(13, "배송 지역별 조건부 추가 배송비", { checkout: fee("remote", 5000, "제주 지역 선택 시 추가 배송비", false) }),
  priceCase(14, "필수 비용 0원", { checkout: fee("pack", 0, "필수 포장") }),
  priceCase(15, "쿠폰으로 합계 감소", { checkout: fee("coupon", -3000, "쿠폰 할인", false) }),
  priceCase(16, "구매자가 사이즈 변경 후 추가 금액 반영", { cart: fee("size", 3000, "구매자가 선택한 큰 사이즈", false) }),
  priceCase(17, "주문서의 선택형 보증 연장", { checkout: fee("warranty", 4500, "선택 보증 연장", false) }),
  priceCase(18, "같은 비용의 표시 이름만 변경", { product: fee("handling", 2000, "상품 취급비"), cart: fee("handling", 2000, "필수 처리비") }),
  priceCase(19, "가격 변동이 없는 구매", {}),
  priceCase(20, "데모 속성 없이 표시된 선택 배송 서비스", { checkout: "<p>선택 배송 서비스 3,000원</p>" }),
] satisfies DetectionCase[];
