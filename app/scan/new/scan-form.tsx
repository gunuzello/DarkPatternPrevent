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
  const [purchasePath, setPurchasePath] = useState<"CART" | "DIRECT">("CART");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const shop = await post("shops", { url: url.trim(), consent: new FormData(event.currentTarget).get("consent") === "on" });
      const scan = await post("scans", scanRequest(shop.shopId, undefined, "CONTEST", viewport, purchasePath));
      router.push("/scan/" + scan.scanId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "진단을 시작하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p>공개 HTTPS 쇼핑몰 또는 상품 상세 URL만 입력하면 바로 진단을 시작합니다. 먼저 공개 화면을 검사하고, 장바구니·주문서 동적 검사는 별도 권한 연결 후 실행합니다.</p>
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
      <fieldset>
        <legend>구매 경로</legend>
        <label><input type="radio" name="purchasePath" checked={purchasePath === "CART"} onChange={() => setPurchasePath("CART")} /> 장바구니 경유</label>{" "}
        <label><input type="radio" name="purchasePath" checked={purchasePath === "DIRECT"} onChange={() => setPurchasePath("DIRECT")} /> 바로구매</label>
      </fieldset>
      <label><input type="checkbox" name="consent" required /> 이 대상에 대한 자동 진단 권한이 있으며 검사에 동의합니다.</label>
      <button type="submit" className="action" disabled={pending}>{pending ? "요청 중…" : "진단 시작"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
