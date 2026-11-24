import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { headers } from "next/headers";
import { GoogleSignIn } from "@/components/google-sign-in";
import { InAppNotice } from "@/components/in-app-notice";
import { LandingShell } from "@/components/landing-shell";
import { detectInAppBrowser, externalOpenUrl } from "@/lib/in-app-browser";
import { demoEnabled, isConfigured } from "@/lib/supabase/server";
import { readThemeMode } from "@/lib/theme-cookie";
import "./login.css";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  school: "인증된 @hanyang.ac.kr Google 계정으로 다시 로그인해 주세요.",
  oauth: "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  setup: "학교 계정 로그인은 Supabase 연결 후 사용할 수 있습니다.",
};

/** The in-app browser notice for this request, or null in a normal browser. */
async function inAppNotice() {
  const requestHeaders = await headers();
  const browser = detectInAppBrowser(requestHeaders.get("user-agent"));
  if (!browser) return null;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "hy-easy.vercel.app";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const pageUrl = `${protocol}://${host}/login`;
  const openUrl = externalOpenUrl(browser, pageUrl);
  return (
    <InAppNotice
      appName={browser.name}
      platform={browser.platform}
      openUrl={openUrl}
      pageUrl={pageUrl}
      autoOpen={browser.kakao}
    />
  );
}

function SignIn({ error, notice }: { error?: string; notice: React.ReactNode }) {
  return (
    <div className="landing-signin">
      {notice}
      {error && (
        <div className="form-error" role="alert">
          {errors[error] ?? errors.oauth}
        </div>
      )}
      {isConfigured() && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
        <GoogleSignIn clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID} />
      ) : isConfigured() ? (
        <a className="google-login" href="/auth/login">
          <span className="google-g">G</span>한양대 Google 계정으로 계속
        </a>
      ) : (
        <div className="setup-message">
          <b>학교 로그인 연결 준비 중</b>
          <span>데모에서 공고 비교와 일정 관리를 먼저 살펴보세요.</span>
        </div>
      )}
      {/* The link is the sign-in without the Google button script (/auth/login → /auth/google/callback). */}
      <p className="landing-signin-note">
        한양대 계정만 가능 · <a href="/auth/login">다른 방법으로 로그인</a>
      </p>
      {demoEnabled() && (
        <Link className="demo-link" href="/demo">
          전체 데모 열기 <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [notice, theme] = await Promise.all([inAppNotice(), readThemeMode()]);
  return (
    <LandingShell initialTheme={theme} demoEnabled={demoEnabled()} signIn={<SignIn error={error} notice={notice} />} />
  );
}
