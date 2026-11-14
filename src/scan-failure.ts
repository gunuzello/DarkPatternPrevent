export type DynamicFailureCode = "AUTH_CHALLENGE" | "FETCH_FAILED" | "DYNAMIC_JOURNEY_FAILED";

/** Keep authentication blocks distinct from ordinary navigation failures. */
export function classifyDynamicFailure(message: string): DynamicFailureCode {
  if (/(?:otp|captcha|추가 인증|인증 코드|보안 문자|로그인에 실패)/i.test(message)) return "AUTH_CHALLENGE";
  if (/(?:ENOTFOUND|ERR_NAME_NOT_RESOLVED|ERR_EMPTY_RESPONSE|ECONNREFUSED|ECONNRESET|ERR_CONNECTION)/i.test(message)) return "FETCH_FAILED";
  return "DYNAMIC_JOURNEY_FAILED";
}
