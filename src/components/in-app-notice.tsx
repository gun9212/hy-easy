"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Platform } from "@/lib/in-app-browser";

type Props = { appName: string; platform: Platform; openUrl: string | null; pageUrl: string; autoOpen: boolean };

/** Shown on the login page inside an app's built-in browser, where Google blocks sign-in. */
export function InAppNotice({ appName, platform, openUrl, pageUrl, autoOpen }: Props) {
  const [copied, setCopied] = useState(false);

  // KakaoTalk opens the page in the system browser straight away; the button stays for when that is cancelled.
  useEffect(() => {
    if (autoOpen && openUrl) window.location.href = openUrl;
  }, [autoOpen, openUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
    } catch {
      window.prompt("주소를 길게 눌러 복사해 주세요.", pageUrl);
    }
  }

  const browser = platform === "ios" ? "Safari" : "Chrome";
  return (
    <div className="in-app-notice" role="alert">
      <b>{appName} 안에서는 Google 로그인이 막혀요</b>
      <p>
        Google이 앱 속 브라우저의 로그인을 허용하지 않아요. {browser} 같은 기본 브라우저에서 열어 주세요.
        {!openUrl && " 화면의 ··· 메뉴에서 '다른 브라우저로 열기'를 고르거나, 주소를 복사해 붙여 넣으면 돼요."}
      </p>
      <div className="in-app-actions">
        {openUrl && (
          <a className="in-app-open" href={openUrl}>
            <ExternalLink size={16} aria-hidden="true" />
            기본 브라우저로 열기
          </a>
        )}
        <button type="button" className="in-app-copy" onClick={() => void copy()}>
          {copied ? "주소를 복사했어요" : "주소 복사"}
        </button>
      </div>
    </div>
  );
}
