"use client";

import { useEffect, useState } from "react";
import { stageLabels } from "../../../../src/demo";
import { legalRules } from "../../../../src/legal-rules";
import type { Finding } from "../../../../src/rules";

export function FindingDetail({ id, finding }: { id: string; finding: string }) {
  const [detail, setDetail] = useState<Finding>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/findings/" + encodeURIComponent(finding), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (result.scanId !== id) throw new Error();
        setDetail(result);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [id, finding]);

  if (!detail) return failed ? <p role="alert">발견 항목을 불러오지 못했습니다.</p> : <p role="status">증거 불러오는 중…</p>;
  const rule = legalRules[detail.type];
  return (
    <>
      <h1>{rule.title}</h1>
      <p>{detail.reason}</p>
      <p>위험 의심 · 운영자 검토 필요</p>
      <h2>개선 방법</h2>
      <p>{rule.recommendation}</p>
      <p><a href={rule.source}>{rule.reference}</a></p>
      <h2>화면 증거</h2>
      {detail.evidence.map((snapshot) => (
        <figure key={snapshot.stage}>
          <figcaption>{stageLabels[snapshot.stage]}</figcaption>
          <img className="evidence" src={"/api/v1/evidences/" + id + "-" + snapshot.stage} alt={stageLabels[snapshot.stage] + " 진단 화면"} />
          <ul>{snapshot.priceLines.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </figure>
      ))}
    </>
  );
}
