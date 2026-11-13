import Link from "next/link";
import { notFound } from "next/navigation";
import { scenarios, stages } from "../../../../src/demo";

type Props = {
  params: Promise<{ scenario: string; stage: string }>;
  searchParams: Promise<{ gift?: string | string[] }>;
};

const productPrice = 18000;
const giftPrice = 2000;
const handlingFee = 3000;
const won = (amount: number) => amount.toLocaleString("ko-KR") + "원";

export default async function DemoPage({ params, searchParams }: Props) {
  const { scenario, stage } = await params;
  const { gift } = await searchParams;
  if (!scenarios.some((value) => value === scenario) || !stages.some((value) => value === stage)) {
    notFound();
  }

  const risky = scenario === "risky";
  const product = stage === "product";
  const checkout = stage === "checkout";
  const showFee = !risky || checkout;
  const giftSelected = product ? risky : gift === "yes";
  const total = productPrice + (giftSelected ? giftPrice : 0) + (showFee ? handlingFee : 0);
  const title = product ? "드립백 커피 10개입" : checkout ? "주문서" : "장바구니";
  const cartPath = "/demo/" + scenario + "/cart";
  const checkoutPath = "/demo/" + scenario + "/checkout" + (giftSelected ? "?gift=yes" : "");

  return (
    <main data-stage={stage}>
      <Link href="/">바로미</Link>
      <p className="eyebrow">모의 쇼핑몰 · {risky ? "위험 사례" : "정상 사례"}</p>
      <h1>{title}</h1>
      <ul aria-label="가격 내역">
        <li>상품가 {won(productPrice)}</li>
        {!product && giftSelected && <li>선물 포장 {won(giftPrice)}</li>}
        {showFee && <li data-fee-id="handling" data-required="true" data-won={handlingFee}>필수 처리비 {won(handlingFee)}</li>}
      </ul>
      {!product && <p><strong data-total>표시 합계 {won(total)}</strong></p>}
      {product && (
        <form action={cartPath} method="get">
          <label>
            <input type="checkbox" name="gift" value="yes" defaultChecked={giftSelected} data-option-won={giftPrice} />
            {" "}선물 포장 (+{won(giftPrice)})
          </label>
          <button className="action" type="submit">장바구니에 담기</button>
        </form>
      )}
      {product && <a className="action secondary" href={checkoutPath}>바로구매</a>}
      {stage === "cart" && <a className="action" href={checkoutPath}>주문서 보기</a>}
      {checkout && <p>데모 주문서입니다. 탐색은 여기에서 종료됩니다.</p>}
    </main>
  );
}
