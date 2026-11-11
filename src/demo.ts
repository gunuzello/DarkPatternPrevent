export const scenarios = ["clean", "risky"] as const;
export const stages = ["product", "cart", "checkout"] as const;
export type Scenario = typeof scenarios[number];
export type Stage = typeof stages[number];
