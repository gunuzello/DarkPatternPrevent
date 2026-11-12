"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { post, scanRequest } from "../../scan-request";

export function ScanForm({ clean, risky }: { clean: string; risky: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [viewport, setViewport] = useState<"DESKTOP" | "MOBILE">("DESKTOP");
  const [verification, setVerification] = useState<{ shopId: string; metaTag: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const shop = await post("shops", { url: url.trim(), consent: new FormData(event.currentTarget).get("consent") === "on" });
      if (shop.verification) {
        setVerification({ shopId: shop.shopId, metaTag: shop.verification.metaTag });
        setPending(false);
        return;
      }
      const scan = await post("scans", scanRequest(shop.shopId, undefined, "CONTEST", viewport));
      router.push("/scan/" + scan.scanId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "진단을 시작하지 못했습니다.");
      setPending(false);
    }
  }

  async function verifyAndStart() {
    if (!verification) return;
    setPending(true);
    setError("");
    try {
      await post("shops/" + verification.shopId + "/verify", {});
      const scan = await post("scans", scanRequest(verification.shopId, undefined, "DYNAMIC", viewport));
      router.push("/scan/" + scan.scanId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사이트 확인에 실패했습니다.");
      setPending(false);
    }
  }

  if (verification) return (
    <section aria-labelledby="verification-title">
      <h2 id="verification-title">쇼핑몰 관리 권한 확인</h2>
      <p>아래 태그를 쇼핑몰 첫 화면의 <code>&lt;head&gt;</code> 안에 추가하세요. 확인된 쇼핑몰만 장바구니·주문서 동적 진단을 실행합니다.</p>
      <pre><code>{verification.metaTag}</code></pre>
      <button type="button" className="action" disabled={pending} onClick={verifyAndStart}>{pending ? "확인 중…" : "게시 완료 · 동적 진단 시작"}</button>
      <button type="button" className="action secondary" disabled={pending} onClick={() => setVerification(null)}>URL 다시 입력</button>
      {error && <p role="alert">{error}</p>}
    </section>
  );

  return (
    <form onSubmit={submit}>
      <p>공개 HTTPS 쇼핑몰 또는 상품 상세 URL을 입력하세요. 외부 쇼핑몰은 공개 상품 화면을 읽어 사전선택을 점검합니다.</p>
      <div className="choices">
        <button type="button" className="action secondary" onClick={() => setUrl(risky)}>위험 데모 URL 사용</button>
        <button type="button" className="action secondary" onClick={() => setUrl(clean)}>정상 데모 URL 사용</button>
      </div>
      <label className="field">쇼핑몰 URL
        <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required />
      </label>
      <fieldset>
        <legend>화면 환경</legend>
        <label><input type="radio" name="viewport" checked={viewport === "DESKTOP"} onChange={() => setViewport("DESKTOP")} /> PC</label>{" "}
        <label><input type="radio" name="viewport" checked={viewport === "MOBILE"} onChange={() => setViewport("MOBILE")} /> 모바일</label>
      </fieldset>
      <label><input type="checkbox" name="consent" required /> 이 대상에 대한 자동 진단 권한이 있으며 검사에 동의합니다.</label>
      <button type="submit" className="action" disabled={pending}>{pending ? "요청 중…" : "진단 시작"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
