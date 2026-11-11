import Link from "next/link";
import { demoTarget } from "../../../src/targets";
import { ScanForm } from "./scan-form";

export const dynamic = "force-dynamic";

export default function NewScanPage() {
  return (
    <main>
      <Link href="/">DarkPattern Guard</Link>
      <h1>새 쇼핑몰 진단</h1>
      <p>상품 상세, 장바구니, 주문서의 유료 옵션과 필수 비용을 확인합니다.</p>
      <ScanForm clean={demoTarget("clean")} risky={demoTarget("risky")} />
    </main>
  );
}
