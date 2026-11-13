"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Scan = {
  scanId: string; status: string; executionMode: string; viewport: string; purchasePath: string;
  createdAt: string; durationMs: number | null; summary: { suspected: number; reviewNeeded: number };
};

export function ShopHistory({ shopId }: { shopId: string }) {
  const [scans, setScans] = useState<Scan[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/v1/shops/${encodeURIComponent(shopId)}/scans`)
      .then(async (response) => { if (!response.ok) throw new Error(); setScans(await response.json()); })
      .catch(() => setError("진단 이력을 불러오지 못했습니다."));
  }, [shopId]);
  if (error) return <p role="alert">{error}</p>;
  if (!scans) return <p role="status">이력 불러오는 중…</p>;
  if (!scans.length) return <p>아직 진단 이력이 없습니다.</p>;
  return <ul>{scans.map((scan) => <li key={scan.scanId}>
    <Link href={`/report/${scan.scanId}`}>{new Date(scan.createdAt).toLocaleString("ko-KR")} · {scan.status}</Link>
    <span> · {scan.viewport === "MOBILE" ? "모바일" : "PC"} · {scan.purchasePath === "DIRECT" ? "바로구매" : "장바구니"} · 위험 {scan.summary.suspected}건</span>
  </li>)}</ul>;
}
