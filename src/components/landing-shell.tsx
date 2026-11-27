"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Moon, Sun } from "lucide-react";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import type { ThemeMode } from "@/lib/theme-mode";
import { LandingPreview } from "./landing-preview";
import { saveThemeMode } from "./workspace/theme-toggle";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeDark(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribeDark,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

type Props = {
  initialTheme: ThemeMode;
  initialNarrow: boolean;
  demoEnabled: boolean;
  signIn: React.ReactNode;
};

export function LandingShell({ initialTheme, initialNarrow, demoEnabled, signIn }: Props) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const osDark = usePrefersDark();
  const activeMode: "light" | "dark" = theme === "system" ? (osDark ? "dark" : "light") : theme;

  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  function chooseTheme(next: "light" | "dark") {
    saveThemeMode(next);
    setTheme(next);
  }

  return (
    <Theme theme={neutralTheme} mode={theme}>
      <main className="landing">
        <header className="landing-header">
          <Link href="/" className="brand">
            <span className="brand-name">HY-Easy</span>
          </Link>
          <div className="landing-header-actions">
            <div className="landing-theme-switch" role="group" aria-label="화면 테마">
              <button
                type="button"
                aria-pressed={activeMode === "light"}
                className={activeMode === "light" ? "is-active" : undefined}
                onClick={() => chooseTheme("light")}
              >
                <Sun size={14} aria-hidden="true" />
                라이트
              </button>
              <button
                type="button"
                aria-pressed={activeMode === "dark"}
                className={activeMode === "dark" ? "is-active" : undefined}
                onClick={() => chooseTheme("dark")}
              >
                <Moon size={14} aria-hidden="true" />
                다크
              </button>
            </div>
            <a className="landing-hywep-link" href="https://hywep.hanyang.ac.kr/" target="_blank" rel="noreferrer">
              HY-WEP <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <div className="landing-body">
          <section className="landing-hero">
            <h1>하이웹을 더 쉽게</h1>
            {signIn}
          </section>
          <LandingPreview demoEnabled={demoEnabled} initialNarrow={initialNarrow} />
        </div>
        <footer className="landing-footer">
          <span>한양대 비공식 서비스 · 실제 지원은 HY-WEP</span>
          <Link href="/privacy">개인정보처리방침</Link>
        </footer>
      </main>
    </Theme>
  );
}
