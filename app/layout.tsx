import type { ReactNode } from "react";
import "./style.css";

export const metadata = { title: "DarkPattern Guard" };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
