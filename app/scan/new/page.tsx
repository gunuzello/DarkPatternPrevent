import Link from "next/link";
import { ScanForm } from "./scan-form";
import "./scan.css";

export const dynamic = "force-dynamic";

export default function NewScanPage() {
  return (
    <div className="scan-page">
      <header className="site-header"><Link className="brand" href="/" aria-label="바로미 홈"><img src="/brand/baromi-logo-full.png" alt="바로미" /></Link><Link className="scan-back" href="/">서비스 소개로 돌아가기 →</Link></header>
      <main className="scan-layout">
        <div className="scan-heading"><p className="eyebrow">START YOUR SCAN</p><h1>내 쇼핑몰 진단하기</h1><p>구매 과정에서 고객이 마주하는 가격과 선택 항목을 확인해 보세요.</p></div>
        <div className="scan-columns"><section className="scan-panel"><h2>진단 설정</h2><ScanForm /></section><aside className="scan-aside"><span className="scan-aside-icon">✦</span><h2>바로미가 확인하는 것</h2><div><strong>01 · 기본 선택 항목</strong><p>의도치 않게 선택된 유료 옵션이나 동의 항목을 살펴봅니다.</p></div><div><strong>02 · 가격 공개 시점</strong><p>상품 화면부터 주문서까지 비용이 언제 나타나는지 기록합니다.</p></div><div><strong>03 · 확인 가능한 근거</strong><p>확인한 단계와 미검사 범위를 구분해 리포트로 제공합니다.</p></div><small>진단 결과는 가이드라인 기준 위험 신호이며 적법성 확정 판단이 아닙니다.</small></aside></div>
      </main>
    </div>
  );
}
