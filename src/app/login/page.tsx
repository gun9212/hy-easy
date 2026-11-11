import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, GitCompareArrows, CalendarClock, Layers3 } from "lucide-react";
import { demoEnabled, isConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  school: "인증된 @hanyang.ac.kr Google 계정으로 다시 로그인해 주세요.",
  oauth: "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  setup: "학교 계정 로그인은 Supabase 연결 후 사용할 수 있습니다.",
};
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <header className="login-header">
        <Link href="/" className="brand">
          <Image
            className="brand-symbol"
            src="/brand/hyu-symbol.svg"
            alt=""
            width={34}
            height={34}
            unoptimized
            priority
          />
          <span className="brand-name">HY-Easy</span>
        </Link>
        <a href="https://hywep.hanyang.ac.kr/" target="_blank" rel="noreferrer">
          HY-WEP 바로가기 <ArrowUpRight size={14} />
        </a>
      </header>
      <div className="login-layout">
        <section className="login-message">
          <h1>
            첫 커리어의 시작,
            <br />
            조금 더 명확하게.
          </h1>
          <p>
            흩어진 실습 정보를 한눈에 비교하고,
            <br />
            나에게 맞는 직군과 지원 일정을 찾아보세요.
          </p>
          <div className="login-features">
            <div>
              <Layers3 />
              <span>
                <b>하는 일로 찾는 직군</b>
                <small>실습 내용과 자격사항을 함께 살펴봐요.</small>
              </span>
            </div>
            <div>
              <GitCompareArrows />
              <span>
                <b>같은 기준으로 비교</b>
                <small>업무부터 지원금, 마감시간까지 나란히.</small>
              </span>
            </div>
            <div>
              <CalendarClock />
              <span>
                <b>다음 지원까지 생각한 일정</b>
                <small>진행 중인 지원과 다음 기회를 함께 확인해요.</small>
              </span>
            </div>
          </div>
        </section>
        <section className="login-box">
          <Image className="login-school" src="/brand/hyu-symbol.svg" alt="" width={56} height={56} unoptimized />
          <h2>한양인, 반가워요</h2>
          <p>학교 Google 계정으로 시작하세요.</p>
          {error && (
            <div className="form-error" role="alert">
              {errors[error] ?? errors.oauth}
            </div>
          )}
          {isConfigured() ? (
            <a className="google-login" href="/auth/login">
              <span className="google-g">G</span>한양대 Google 계정으로 계속
            </a>
          ) : (
            <div className="setup-message">
              <b>학교 로그인 연결 준비 중</b>
              <span>데모에서 공고 비교와 일정 관리를 먼저 살펴보세요.</span>
            </div>
          )}
          <div className="login-note">
            <Check size={14} />
            <span>
              @hanyang.ac.kr 이메일 소유를 확인합니다.
              <br />
              재학생 여부와 실습 지원 자격은 별도 확인이 필요해요.
            </span>
          </div>
          {demoEnabled() && (
            <Link className="demo-link" href="/demo">
              가상 공고로 둘러보기 <ArrowRight size={16} />
            </Link>
          )}
          <p className="login-disclaimer">
            HY-Easy는 한양대학교의 공식 서비스가 아닙니다.
            <br />
            실제 지원과 최종 정보 확인은 HY-WEP에서 진행합니다.
          </p>
        </section>
      </div>
      <footer className="login-footer">
        <span>HY-Easy © 2026</span>
        <Link href="/privacy">개인정보처리방침</Link>
        <span>더 잘 알고, 더 나은 선택.</span>
      </footer>
    </main>
  );
}
