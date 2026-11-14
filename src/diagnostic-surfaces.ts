export const diagnosticSurfaceKinds = [
  "CATALOG", "AUTH", "COUPON", "RECOMMENDATION", "SUBSCRIPTION", "CANCELLATION", "POLICY",
] as const;

export type DiagnosticSurfaceKind = typeof diagnosticSurfaceKinds[number];
export type DiagnosticSurfaceStatus = "COVERED" | "BLOCKED" | "NOT_FOUND" | "PENDING" | "SKIPPED";

export const diagnosticSurfaceLabels: Record<DiagnosticSurfaceKind, string> = {
  CATALOG: "상품 목록·카테고리·검색",
  AUTH: "로그인·회원가입",
  COUPON: "쿠폰·프로모션",
  RECOMMENDATION: "추천·인기·후기",
  SUBSCRIPTION: "구독·멤버십·자동 갱신",
  CANCELLATION: "해지·탈퇴·환불",
  POLICY: "배송·교환·반품·정책",
};
