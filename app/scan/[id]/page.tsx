import Link from "next/link";
import { ScanProgress } from "./scan-progress";
import "../new/scan.css";

export const metadata = { robots: { index: false, follow: false } };

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="scan-page"><header className="site-header"><Link className="brand" href="/" aria-label="바로미 홈"><img src="/brand/baromi-logo-full.png" alt="바로미" /></Link><Link className="scan-back" href="/">서비스 소개로 돌아가기 →</Link></header><main className="scan-layout"><div className="scan-heading"><p className="eyebrow">LIVE DIAGNOSIS</p><h1>쇼핑몰을 살펴보고 있어요</h1><p>결제나 주문 확정 없이, 고객이 마주하는 구매 흐름을 단계별로 기록합니다.</p></div><div className="scan-panel"><ScanProgress id={id} /></div></main></div>;
}
