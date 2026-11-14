"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { stages, stageLabels, type Stage } from "../../../src/demo";
import { legalRules } from "../../../src/legal-rules";
import type { compareScans } from "../../../src/scan-comparison";
import { post, scanRequest } from "../../scan-request";

const failureLabels: Record<string, string> = {
  FETCH_FAILED: "첫 화면 접근 실패",
  PRODUCT_NOT_FOUND: "상품 상세 미발견",
  DYNAMIC_RENDER_FAILED: "동적 화면 렌더링 실패",
  DYNAMIC_JOURNEY_FAILED: "구매 흐름 수집 실패",
  AUTH_CHALLENGE: "추가 인증으로 중단",
};

type Report = {
  shopId: string;
  scenario: string;
  scanStatus: "COMPLETED" | "PARTIAL";
  executionMode: "DEMO" | "STATIC" | "DYNAMIC";
  viewport: "DESKTOP" | "MOBILE";
  purchasePath: "CART" | "DIRECT";
  collectionFailure?: string;
  collectionFailureCode?: string;
  durationMs: number | null;
  targetUrl: string;
  coverage: Record<Stage, "COVERED" | "BLOCKED" | "PENDING" | "SKIPPED">;
  summary: { suspected: number; reviewNeeded: number; notTested: number };
  comparison?: (ReturnType<typeof compareScans> & { baselineScanId: string }) | null;
  explorationBlocker?: {
    stage: Stage; code: "ACTION_NOT_FOUND" | "ACTION_AMBIGUOUS" | "ACTION_FAILED" | "LOGIN_REQUIRED";
    action: "ADD_TO_CART" | "OPEN_CHECKOUT" | "DIRECT_BUY"; candidateCount: number;
  } | null;
  findings: { id: number; type: keyof typeof legalRules; stage: Stage; reason: string }[];
  reviewCandidates?: { id: string; kind: string; stage: Stage | "surface"; text: string; reason: string; evidenceIds: string[] }[];
  surfaceObservations?: { evidenceId: string; kind: "AUTH" | "SUBSCRIPTION" | "CANCELLATION"; url: string; status: number | null; title: string; text: string; outcome: string }[];
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
      <p><Link href={`/shop/${report.shopId}`}>이 상점의 진단 이력 보기</Link></p>
      <p><a href={`/api/v1/scans/${encodeURIComponent(id)}/report?download=1`} download={`baromi-${id}.json`}>보고서 JSON 다운로드</a></p>
      <p>화면 환경 · {report.viewport === "MOBILE" ? "모바일 390×844" : "PC 1440×1000"} · {report.purchasePath === "DIRECT" ? "바로구매" : "장바구니 경유"}</p>
      {report.durationMs !== null && <p>진단 소요 시간 · {(report.durationMs / 1000).toFixed(1)}초</p>}
      <dl className="summary">
        <div><dt>위험 의심</dt><dd>{report.summary.suspected}</dd></div>
        <div><dt>확인 필요</dt><dd>{report.summary.reviewNeeded}</dd></div>
        <div><dt>미검사</dt><dd>{report.summary.notTested}</dd></div>
      </dl>
      <h2>검사 범위</h2>
      {report.executionMode === "STATIC" && <p>공개 상품 화면(서버 HTML 또는 안전한 같은 출처 렌더링)을 검사했습니다. 장바구니·주문서의 추가 비용과 구매 행동 후 표시되는 항목은 미검사입니다.</p>}
      {report.executionMode === "DYNAMIC" && <p>확인된 쇼핑몰에서 별도 세션으로 동적 구매 흐름을 검사했습니다. 실제 주문 확정과 결제는 실행하지 않았습니다.</p>}
      {report.collectionFailure && <p role="status">수집 안내{report.collectionFailureCode ? ` (${failureLabels[report.collectionFailureCode] ?? report.collectionFailureCode})` : ""}: {report.collectionFailure}</p>}
      {report.executionMode === "DYNAMIC" && report.scanStatus === "PARTIAL" && <section aria-label="동적 검사 대안">
        <h2>검사를 이어가는 방법</h2>
        <ul>
          <li>로그인 정보가 필요한 경우 운영자가 만든 전용 테스트 계정을 입력해 다시 검사할 수 있습니다.</li>
          <li>OTP·CAPTCHA가 나타나면 자동 우회하지 않습니다. 현재는 전용 테스트 계정에서 추가 인증을 완료하거나 공개 화면 진단으로 전환해 주세요.</li>
          <li>인증을 연결하지 않아도 공개 화면 진단 결과와 로그인 이후 미검사 범위는 계속 확인할 수 있습니다.</li>
        </ul>
      </section>}
      <ul>{stages.map((stage) => <li key={stage}>{stageLabels[stage]} · {report.coverage[stage] === "COVERED" ? (report.executionMode === "STATIC" ? "초기 HTML 확인 · 동적 화면 미검사" : "검사 완료") : report.coverage[stage] === "SKIPPED" ? "선택 경로에 없음" : "미검사"}</li>)}</ul>
      {report.explorationBlocker && <p role="status">탐색 중단: {stageLabels[report.explorationBlocker.stage]}에서 {report.explorationBlocker.action === "ADD_TO_CART" ? "장바구니 담기" : report.explorationBlocker.action === "DIRECT_BUY" ? "바로구매" : "주문서 이동"} 동작을 {report.explorationBlocker.code === "LOGIN_REQUIRED" ? "로그인 화면으로 판단했습니다. 승인된 테스트 계정 또는 로그인 세션이 필요합니다." : report.explorationBlocker.code === "ACTION_AMBIGUOUS" ? `하나로 확정하지 못했습니다(후보 ${report.explorationBlocker.candidateCount}개).` : report.explorationBlocker.code === "ACTION_FAILED" ? "실행했지만 화면 전환을 확인하지 못했습니다." : "찾지 못했습니다."}</p>}
      {report.surfaceObservations?.length ? <section aria-label="추가 흐름 관찰">
        <h2>추가 흐름 관찰</h2>
        <p>로그인·구독·해지 후보를 읽기 전용으로 확인했습니다. 폼 제출이나 결제·해지 동작은 실행하지 않았습니다.</p>
        <ul>{report.surfaceObservations.map((item) => <li key={`${item.kind}:${item.url}`}>
          {item.kind === "AUTH" ? "로그인·회원가입" : item.kind === "SUBSCRIPTION" ? "구독·멤버십" : "해지·환불"} · {item.outcome === "OBSERVED" ? "확인됨" : item.outcome === "CROSS_ORIGIN" ? "외부 출처로 미검사" : "접근 실패"} · {item.url} · 증거 {item.evidenceId}
          {item.title ? ` · ${item.title}` : ""}
        </li>)}</ul>
      </section> : null}
      <h2>발견된 항목</h2>
      {report.findings.length ? <ul>{report.findings.map((finding) => (
        <li key={finding.id}><Link href={"/report/" + id + "/" + finding.id}>{legalRules[finding.type].title}</Link> · {stageLabels[finding.stage]}</li>
      ))}</ul> : <p>{report.executionMode === "STATIC" ? "검사한 공개 화면에서 지원하는 규칙의 위험 신호를 찾지 못했습니다. 구매 행동 이후 단계는 추가 검사가 필요합니다." : "검사한 범위에서 위험 신호가 발견되지 않았습니다."}</p>}
      {report.reviewCandidates?.length ? <section><h2>추가 검토 후보</h2><p>규칙만으로 의미를 확정하지 않은 문구와 추가 흐름입니다. AI 또는 운영자 검토 대상으로만 전달하며 자동 판정에 포함하지 않습니다.</p><ul>{report.reviewCandidates.map((candidate) => <li key={candidate.id}>{candidate.stage === "surface" ? "추가 흐름" : stageLabels[candidate.stage]} · {candidate.text} · {candidate.reason} · {candidate.evidenceIds.join(", ")}</li>)}</ul></section> : null}
      {report.comparison && (
        <section>
          <h2>재진단 비교</h2>
          <Link href={"/report/" + report.comparison.baselineScanId}>기준 보고서 보기</Link>
          {report.comparison.status === "UNAVAILABLE" ? <p>{report.comparison.reason}</p> : (
            <>
              <p>동일한 검사 범위에서 관측한 위험 신호의 변화입니다.</p>
              {([
                ["신규", report.comparison.added],
                ["재발견", report.comparison.repeated],
                ["이번에 미발견", report.comparison.notObserved],
              ] as const).map(([label, signals]) => (
                <div key={label}>
                  <h3>{label} {signals.length}건</h3>
                  {signals.length > 0 && <ul>{signals.map((signal, index) => (
                    <li key={index}>{stageLabels[signal.stage]} · {signal.reason}</li>
                  ))}</ul>}
                </div>
              ))}
            </>
          )}
        </section>
      )}
      <button className="action" disabled={pending} onClick={async () => {
        setPending(true);
        try {
          const next = await post("scans", scanRequest(
            report.shopId, id, report.executionMode === "DYNAMIC" ? "DYNAMIC" : "CONTEST", report.viewport, report.purchasePath,
          ));
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
