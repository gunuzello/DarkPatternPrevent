"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { post, scanRequest } from "../../scan-request";

export function ScanForm({ clean, risky }: { clean: string; risky: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const shop = await post("shops", { url: url.trim(), consent: new FormData(event.currentTarget).get("consent") === "on" });
      const scan = await post("scans", scanRequest(shop.shopId));
      router.push("/scan/" + scan.scanId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "진단을 시작하지 못했습니다.");
      setPending(false);
    }
  }

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
      <label><input type="checkbox" name="consent" required /> 이 대상에 대한 자동 진단 권한이 있으며 검사에 동의합니다.</label>
      <button type="submit" className="action" disabled={pending}>{pending ? "요청 중…" : "진단 시작"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
