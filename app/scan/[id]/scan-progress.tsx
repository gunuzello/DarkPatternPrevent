"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { stages, stageLabels, type Stage } from "../../../src/demo";
import { post, scanRequest } from "../../scan-request";

type Status = "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
type ScanState = {
  shopId: string;
  scenario?: string;
  viewport: "DESKTOP" | "MOBILE";
  purchasePath: "CART" | "DIRECT";
  status: Status;
  cancelRequested: boolean;
  progress: number;
  coverage: Record<Stage, "COVERED" | "BLOCKED" | "PENDING" | "SKIPPED">;
};

const labels = {
  QUEUED: "대기 중", RUNNING: "진단 중", COMPLETED: "진단 완료",
  PARTIAL: "부분 완료", FAILED: "진단 실패", CANCELLED: "진단 중단",
};

export function ScanProgress({ id }: { id: string }) {
  const [scan, setScan] = useState<ScanState>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/v1/scans/" + encodeURIComponent(id), { signal: controller.signal });
        if (!response.ok) throw new Error("진단 상태를 불러오지 못했습니다.");
        const next: ScanState = await response.json();
        setScan(next);
        if (next.status === "QUEUED" || next.status === "RUNNING") timer = setTimeout(refresh, 1000);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "조회에 실패했습니다.");
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id]);

  async function act(action: "cancel" | "retry") {
    if (!scan) return;
    setPending(true);
    setError("");
    try {
      if (action === "cancel") {
        await post("scans/" + id + "/cancel", {});
      } else {
        const result = await post("scans", scanRequest(scan.shopId, undefined, "CONTEST", scan.viewport, scan.purchasePath));
        router.push("/scan/" + result.scanId);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  if (!scan) return error ? <p role="alert">{error}</p> : <p role="status">진단 상태 확인 중…</p>;
  const active = scan.status === "QUEUED" || scan.status === "RUNNING";
  const reportReady = scan.status === "COMPLETED" || scan.status === "PARTIAL";
  return (
    <section>
      <p role="status"><strong>{scan.cancelRequested && active ? "중단 요청 처리 중" : labels[scan.status]}</strong></p>
      {active && <progress aria-label="진단 진행률" value={scan.progress} max={100} />}
      <ul>{stages.map((stage) => <li key={stage}>{stageLabels[stage]} · {
        scan.coverage[stage] === "COVERED" ? (scan.scenario === "public" ? "초기 HTML 확인 · 동적 화면 미검사" : "검사 완료") : scan.coverage[stage] === "SKIPPED" ? "선택 경로에 없음" : scan.coverage[stage] === "BLOCKED" ? "미검사" : "대기"
      }</li>)}</ul>
      {active && <button className="action secondary" disabled={pending || scan.cancelRequested} onClick={() => act("cancel")}>진단 중단</button>}
      {reportReady && <Link className="action" href={"/report/" + id}>진단 결과 보기</Link>}
      {!active && !reportReady && <button className="action" disabled={pending} onClick={() => act("retry")}>같은 조건으로 재진단</button>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
