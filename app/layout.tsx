import type { ReactNode } from "react";
import "./style.css";

export const metadata = {
  title: "바로미 | 쇼핑몰 다크패턴 진단",
  description: "쇼핑몰 구매 흐름의 다크패턴 위험 신호를 근거와 함께 진단합니다.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
