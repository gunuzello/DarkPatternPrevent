import Link from "next/link";
import { ScanReport } from "./scan-report";

export const metadata = { robots: { index: false, follow: false } };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><Link href="/">바로미</Link><h1>진단 결과</h1><ScanReport id={id} /></main>;
}
