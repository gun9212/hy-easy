import type { Metadata } from "next";
import { headers } from "next/headers";
import "./pretendard.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "HY-Easy · 내게 맞는 현장실습 찾기",
  description: "한양대학교 현장실습 공고 비교와 지원 일정 관리",
  robots: { index: false, follow: false },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading the request makes every page render per request, so Next.js can put this request's CSP nonce
  // (set in src/proxy.ts) on its scripts. A prerendered page would carry scripts without a nonce.
  await headers();
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
