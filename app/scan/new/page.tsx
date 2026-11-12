import Link from "next/link";
import { demoTarget } from "../../../src/targets";
import { ScanForm } from "./scan-form";

export const dynamic = "force-dynamic";

export default function NewScanPage() {
  return (
    <main>
      <Link href="/">DarkPattern Guard</Link>
      <h1>새 쇼핑몰 진단</h1>
      <p>쇼핑몰의 공개 상품 화면에서 기본 선택된 유료 옵션을 확인합니다.</p>
      <ScanForm clean={demoTarget("clean")} risky={demoTarget("risky")} />
    </main>
  );
}
