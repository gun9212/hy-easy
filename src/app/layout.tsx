import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { readThemeMode } from "@/lib/theme-cookie";
import "./pretendard.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "HY-Easy · 내게 맞는 현장실습 찾기",
  description: "한양대학교 현장실습 공고 비교와 지원 일정 관리",
  robots: { index: false, follow: false },
};
/** The browser bar takes the page ground (--color-paper in src/app/tokens/semantic.css) in each mode. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfe" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1420" },
  ],
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading the request makes every page render per request, so Next.js can put this request's CSP nonce
  // (set in src/proxy.ts) on its scripts. A prerendered page would carry scripts without a nonce.
  await headers();
  // A chosen theme goes on <html> before the first paint; without one the page follows the device.
  const theme = await readThemeMode();
  return (
    <html lang="ko" data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
