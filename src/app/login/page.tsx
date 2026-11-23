import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { headers } from "next/headers";
import { GoogleSignIn } from "@/components/google-sign-in";
import { InAppNotice } from "@/components/in-app-notice";
import { detectInAppBrowser, externalOpenUrl } from "@/lib/in-app-browser";
import { demoEnabled, isConfigured } from "@/lib/supabase/server";
import "./login.css";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  school: "인증된 @hanyang.ac.kr Google 계정으로 다시 로그인해 주세요.",
  oauth: "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  setup: "학교 계정 로그인은 Supabase 연결 후 사용할 수 있습니다.",
};

/**
 * The preview mirrors the app's posting card (src/components/workspace/posting-cards.tsx) with fictional postings:
 * real ones are visible only to signed-in students. The company is "A사" so no real company is named. Marked
 * aria-hidden as an illustration.
 */
const PREVIEW_MAIN = {
  due: "오늘 마감",
  time: "24:00",
  title: "데이터 분석 인턴",
  company: "A사",
  role: "데이터·AI",
  summary: "주문·재고 데이터를 SQL로 정리하고 주간 리포트 대시보드를 만드는 실습이에요.",
  location: "서울 성동구",
  ratio: "2.7 : 1",
  counts: "지원 8 · 모집 3",
  stipend: { prefix: "월", amount: "2,400,000", suffix: "원" },
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
          가상 공고로 둘러보기 <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

function Preview() {
  const main = PREVIEW_MAIN;
  return (
    <div className="landing-preview" aria-hidden="true">
      <div className="landing-preview-head">
        <span>마감 임박순</span>
        <span>예시 화면</span>
      </div>
      <article className="preview-card">
        <p className="preview-due">
          <span className="preview-dot" />
          <b>{main.due}</b>
          <span>{main.time} 마감</span>
        </p>
        <h2>{main.title}</h2>
        <p className="preview-meta">
          {main.company} · {main.role}
        </p>
        <p className="preview-summary">{main.summary}</p>
        <div className="preview-facts">
          <div>
            <span className="preview-meta">{main.location}</span>
            <b className="preview-ratio">{main.ratio}</b>
            <span className="preview-meta">{main.counts}</span>
          </div>
          <p className="preview-stipend">
            <span>{main.stipend.prefix}</span>
            <b>{main.stipend.amount}</b>
            <span>{main.stipend.suffix}</span>
          </p>
        </div>
      </article>
    </div>
  );
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const notice = await inAppNotice();
  return (
    <main className="landing">
      <header className="landing-header">
        <Link href="/" className="brand">
          <span className="brand-name">HY-Easy</span>
        </Link>
        <a href="https://hywep.hanyang.ac.kr/" target="_blank" rel="noreferrer">
          HY-WEP <ArrowUpRight size={14} />
        </a>
      </header>
      <div className="landing-body">
        <section className="landing-copy">
          <p className="landing-eyebrow">한양대 HY-WEP 현장실습 공고</p>
          <h1>
            하는 일로 찾고,
            <br />
            한눈에 비교하세요.
          </h1>
          <p className="landing-lead">직군·지원금·마감으로 정리하고, 지원 인원은 10분마다 갱신해요.</p>
          <SignIn error={error} notice={notice} />
        </section>
        <Preview />
      </div>
      <footer className="landing-footer">
        <span>한양대 비공식 서비스 · 실제 지원은 HY-WEP</span>
        <Link href="/privacy">개인정보처리방침</Link>
      </footer>
    </main>
  );
}
