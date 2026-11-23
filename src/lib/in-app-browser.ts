/**
 * Google refuses sign-in inside apps' built-in browsers (403 disallowed_useragent), and links shared in KakaoTalk,
 * Instagram or Everytime open there. The login page uses this to tell the student to open the page in Chrome or
 * Safari instead.
 */
export type Platform = "ios" | "android" | "other";
export type InAppBrowser = { name: string; platform: Platform; kakao: boolean };

const NAMED_APPS: [RegExp, string][] = [
  [/KAKAOTALK/i, "카카오톡"],
  [/everytime/i, "에브리타임"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV|FB_IAB/, "페이스북"],
  [/\bLine\//, "라인"],
  [/NAVER\(inapp/i, "네이버 앱"],
  [/DaumApps/i, "다음 앱"],
];

function platformOf(ua: string): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser | null {
  const ua = userAgent ?? "";
  if (!ua) return null;
  const platform = platformOf(ua);
  const named = NAMED_APPS.find(([pattern]) => pattern.test(ua));
  if (named) return { name: named[1], platform, kakao: named[1] === "카카오톡" };
  // Unnamed apps: an Android WebView marks itself with "; wv)", and an iOS WKWebView leaves out the "Safari/" token
  // that Safari, Chrome (CriOS) and Firefox (FxiOS) on iOS all send.
  const androidWebView = platform === "android" && /; wv\)/.test(ua);
  const iosWebView = platform === "ios" && /AppleWebKit/.test(ua) && !/Safari\//.test(ua);
  return androidWebView || iosWebView ? { name: "앱", platform, kakao: false } : null;
}

/** A link that hands the page to the system browser, where the platform offers one; null means copy the link. */
export function externalOpenUrl(browser: InAppBrowser, pageUrl: string): string | null {
  if (browser.kakao) return `kakaotalk://web/openExternal?url=${encodeURIComponent(pageUrl)}`;
  if (browser.platform === "android") {
    const url = new URL(pageUrl);
    const scheme = url.protocol.replace(":", "");
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};action=android.intent.action.VIEW;end`;
  }
  return null;
}
