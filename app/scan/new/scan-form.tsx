"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { post, scanRequest } from "../../scan-request";

export function ScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [viewport, setViewport] = useState<"DESKTOP" | "MOBILE">("DESKTOP");
  const [purchasePath, setPurchasePath] = useState<"CART" | "DIRECT">("CART");
  const [dynamic, setDynamic] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verification, setVerification] = useState<{ shopId: string; metaTag: string; filePath: string; dnsRecord: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const shop = await post("shops", { url: url.trim(), consent: new FormData(event.currentTarget).get("consent") === "on" });
      if (dynamic) {
        if (username && password) {
          const scan = await post("scans", scanRequest(shop.shopId, undefined, "DYNAMIC", viewport, purchasePath, { username, password }));
          router.push("/scan/" + scan.scanId);
          return;
        }
        if (!shop.verification) throw new Error("이 주소는 동적 검사 확인 정보를 발급할 수 없습니다.");
        setVerification({ shopId: shop.shopId, ...shop.verification });
        setPending(false);
        return;
      }
      const scan = await post("scans", scanRequest(shop.shopId, undefined, "CONTEST", viewport, purchasePath));
      router.push("/scan/" + scan.scanId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "진단을 시작하지 못했습니다.");
      setPending(false);
    }
  }

  async function verifyAndScan() {
    if (!verification) return;
    setPending(true);
    setError("");
    try {
      await post(`shops/${verification.shopId}/verify`, {});
      const scan = await post("scans", scanRequest(verification.shopId, undefined, "DYNAMIC", viewport, purchasePath,
        username && password ? { username, password } : undefined));
      router.push("/scan/" + scan.scanId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "소유 확인에 실패했습니다.");
      setPending(false);
    }
  }

  return (
    <form className="scan-form" onSubmit={submit}>
      <p className="scan-form-intro">쇼핑몰 주소만으로 공개 화면을 먼저 확인하고, 테스트 계정을 연결하면 상품·장바구니·주문서까지 실제 구매 흐름을 안전하게 점검합니다.</p>
      <label className="field">쇼핑몰 URL
        <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-shop.com" required />
      </label>
      <fieldset>
        <legend>화면 환경</legend>
        <label><input type="radio" name="viewport" checked={viewport === "DESKTOP"} onChange={() => setViewport("DESKTOP")} /> PC</label>{" "}
        <label><input type="radio" name="viewport" checked={viewport === "MOBILE"} onChange={() => setViewport("MOBILE")} /> 모바일</label>
      </fieldset>
      <fieldset>
        <legend>구매 경로</legend>
        <label><input type="radio" name="purchasePath" checked={purchasePath === "CART"} onChange={() => setPurchasePath("CART")} /> 장바구니 경유</label>{" "}
        <label><input type="radio" name="purchasePath" checked={purchasePath === "DIRECT"} onChange={() => setPurchasePath("DIRECT")} /> 바로구매</label>
      </fieldset>
      <button type="button" className="action secondary scan-mode" aria-pressed={dynamic} onClick={() => setDynamic((value) => !value)}>
        {dynamic ? "전체 구매 흐름 검사 선택됨" : "상품·장바구니·주문서까지 검사"}
      </button>
      {dynamic && <fieldset>
        <legend>전체 진단 범위</legend>
        <p>공개 화면, 상품 상세, 장바구니, 주문서의 선택 상태·가격·추가 비용·안내 문구·접근 차단을 기록합니다. 결제와 주문 확정은 누르지 않습니다.</p>
        <div className="scan-scope-summary"><span>예상 시간</span><strong>약 30초~3분</strong><small>사이트 응답·로그인·보안문자에 따라 달라질 수 있어요.</small></div>
        <legend>테스트 계정(선택)</legend>
        <p>회원 전용 가격이나 주문서까지 확인하려면 운영자가 만든 테스트 계정을 입력하세요. 비밀번호는 진단 작업이 끝나면 삭제합니다.</p>
        <label className="field">아이디<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="field">비밀번호<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      </fieldset>}
      <label className="scan-consent"><input type="checkbox" name="consent" required /> 이 대상에 대한 자동 진단 권한이 있으며 검사에 동의합니다.</label>
      <button type="submit" className="action" disabled={pending}>{pending ? "요청 중…" : "진단 시작"}</button>
      {error && <p role="alert">{error}</p>}
      {verification && <section aria-live="polite">
        <h2>상점 소유 확인</h2>
        <p>아래 세 방법 중 하나를 완료한 뒤 확인 버튼을 눌러 주세요. 인증 토큰은 저장하지 않습니다.</p>
        <ol>
          <li>메타 태그: <code>{verification.metaTag}</code></li>
          <li>파일 업로드: <code>{verification.filePath}</code>에 토큰 값 업로드</li>
          <li>DNS TXT: <code>{verification.dnsRecord}</code></li>
        </ol>
        <button type="button" className="action" onClick={verifyAndScan} disabled={pending}>{pending ? "확인 중…" : "소유 확인 후 동적 구매 흐름까지 검사"}</button>
      </section>}
    </form>
  );
}
