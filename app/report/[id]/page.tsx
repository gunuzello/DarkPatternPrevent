import Link from "next/link";
import { ScanReport } from "./scan-report";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><Link href="/">DarkPattern Guard</Link><h1>진단 결과</h1><ScanReport id={id} /></main>;
}
