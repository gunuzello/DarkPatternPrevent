import Link from "next/link";

export default function Home() {
  return (
    <main>
      <p className="eyebrow">쇼핑몰 사전진단 · 개발 데모</p>
      <h1>바로미</h1>
      <p>상품 상세에서 주문서까지 유료 옵션과 필수 비용이 언제 표시되는지 확인합니다.</p>
      <nav aria-label="데모 시나리오">
        <Link className="action" href="/scan/new">쇼핑몰 진단 시작</Link>
        <Link className="action secondary" href="/demo/risky/product">위험 사례 보기</Link>
        <Link className="action secondary" href="/demo/clean/product">정상 사례 보기</Link>
      </nav>
    </main>
  );
}
