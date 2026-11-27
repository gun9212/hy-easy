import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AstryxLocale } from "@/components/astryx-locale";
import { SiteAnalytics } from "@/components/site-analytics";
import { readThemeMode } from "@/lib/theme-cookie";
import "./pretendard.css";
import "./globals.css";

const SITE_URL = "https://hy-easy.vercel.app";
const TITLE = "HY-Easy · 하이웹을 더 간단히";
const SHARE_DESCRIPTION = "한양대 HY-WEP 현장실습 공고를 직군·실습지원비·마감 기준으로 찾고 비교해요.";
// Link previews in KakaoTalk, Everytime and messengers read these tags (they ignore robots noindex).
// Bump ?v= when og.png changes: KakaoTalk caches previews by image URL.
const SHARE_IMAGE = { url: "/og.png?v=4", width: 1200, height: 630, alt: "HY-Easy, 하는 일로 찾고 한눈에 비교하세요." };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: "한양대학교 현장실습 공고 비교와 지원 일정 관리",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "HY-Easy",
    locale: "ko_KR",
    url: "/login",
    title: TITLE,
    description: SHARE_DESCRIPTION,
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: SHARE_DESCRIPTION, images: [SHARE_IMAGE] },
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
      <body>
        <AstryxLocale>{children}</AstryxLocale>
        <SiteAnalytics />
      </body>
    </html>
  );
}
