import Link from "next/link";
import { ScanProgress } from "./scan-progress";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><Link href="/">DarkPattern Guard</Link><h1>진단 진행</h1><ScanProgress id={id} /></main>;
}
