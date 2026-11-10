import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HY-Easy · 내게 맞는 현장실습 찾기",
  description: "한양대학교 현장실습 공고 비교와 지원 일정 관리",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
