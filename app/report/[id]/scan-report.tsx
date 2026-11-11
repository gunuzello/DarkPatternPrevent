"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { stages, stageLabels, type Stage } from "../../../src/demo";
import { legalRules } from "../../../src/legal-rules";
import { post, scanRequest } from "../../scan-request";

type Report = {
  shopId: string;
  scanStatus: "COMPLETED" | "PARTIAL";
  targetUrl: string;
  coverage: Record<Stage, string>;
  summary: { suspected: number; reviewNeeded: number; notTested: number };
  findings: { id: number; type: keyof typeof legalRules; stage: Stage; reason: string }[];
};

export function ScanReport({ id }: { id: string }) {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/scans/" + encodeURIComponent(id) + "/report", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("진단 결과를 불러오지 못했습니다.");
        setReport(await response.json());
      })
      .catch(() => { if (!controller.signal.aborted) setError("진단 결과를 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [id]);

  if (!report) return error ? <p role="alert">{error}</p> : <p role="status">결과 불러오는 중…</p>;
  return (
    <>
      <p className="eyebrow">{report.scanStatus === "COMPLETED" ? "진단 완료" : "부분 완료"}</p>
      <p className="target-url">{report.targetUrl}</p>
      <dl className="summary">
        <div><dt>위험 의심</dt><dd>{report.summary.suspected}</dd></div>
        <div><dt>확인 필요</dt><dd>{report.summary.reviewNeeded}</dd></div>
        <div><dt>미검사</dt><dd>{report.summary.notTested}</dd></div>
      </dl>
      <h2>검사 범위</h2>
      <ul>{stages.map((stage) => <li key={stage}>{stageLabels[stage]} · {report.coverage[stage] === "COVERED" ? "검사 완료" : "미검사"}</li>)}</ul>
      <h2>발견된 항목</h2>
      {report.findings.length ? <ul>{report.findings.map((finding) => (
        <li key={finding.id}><Link href={"/report/" + id + "/" + finding.id}>{legalRules[finding.type].title}</Link> · {stageLabels[finding.stage]}</li>
      ))}</ul> : <p>검사한 범위에서 위험 신호가 발견되지 않았습니다.</p>}
      <button className="action" disabled={pending} onClick={async () => {
        setPending(true);
        try {
          const next = await post("scans", scanRequest(report.shopId));
          router.push("/scan/" + next.scanId);
        } catch {
          setError("재진단을 시작하지 못했습니다.");
          setPending(false);
        }
      }}>같은 조건으로 재진단</button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
