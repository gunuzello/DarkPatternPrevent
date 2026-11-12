import type { ReactNode } from "react";
import "./style.css";

export const metadata = { title: "바로미" };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
