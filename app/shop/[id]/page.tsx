import Link from "next/link";
import { ShopHistory } from "./shop-history";

export const dynamic = "force-dynamic";

export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><Link href="/">바로미</Link><h1>상점 진단 이력</h1><ShopHistory shopId={id} /></main>;
}
