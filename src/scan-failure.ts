export type DynamicFailureCode = "AUTH_CHALLENGE" | "DYNAMIC_JOURNEY_FAILED";

/** Keep authentication blocks distinct from ordinary navigation failures. */
export function classifyDynamicFailure(message: string): DynamicFailureCode {
  return /(?:otp|captcha|추가 인증|인증 코드|보안 문자|로그인에 실패)/i.test(message)
    ? "AUTH_CHALLENGE"
    : "DYNAMIC_JOURNEY_FAILED";
}
