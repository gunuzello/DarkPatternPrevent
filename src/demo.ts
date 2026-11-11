export const scenarios = ["clean", "risky"] as const;
export const stages = ["product", "cart", "checkout"] as const;
export type Scenario = typeof scenarios[number];
export type Stage = typeof stages[number];

export const stageLabels = { product: "상품 상세", cart: "장바구니", checkout: "주문서" } satisfies Record<Stage, string>;
