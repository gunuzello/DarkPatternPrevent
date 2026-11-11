import Link from "next/link";
import { FindingDetail } from "./finding-detail";

export default async function FindingPage({ params }: { params: Promise<{ id: string; finding: string }> }) {
  const { id, finding } = await params;
  return <main><Link href={"/report/" + id}>진단 결과로 돌아가기</Link><FindingDetail id={id} finding={finding} /></main>;
}
