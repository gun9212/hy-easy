import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectInAppBrowser, externalOpenUrl } from "../src/lib/in-app-browser";

const UA = {
  kakaoIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0",
  kakaoAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410960",
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 355.0.0.0",
  unknownAndroidApp:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  unknownIosApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
  it("names KakaoTalk on both platforms", () => {
    assert.deepEqual(detectInAppBrowser(UA.kakaoIos), { name: "카카오톡", platform: "ios", kakao: true });
    assert.deepEqual(detectInAppBrowser(UA.kakaoAndroid), { name: "카카오톡", platform: "android", kakao: true });
  });
  it("names other known apps", () => {
    assert.equal(detectInAppBrowser(UA.instagramIos)?.name, "인스타그램");
  });
  it("catches unnamed WebViews", () => {
    assert.deepEqual(detectInAppBrowser(UA.unknownAndroidApp), { name: "앱", platform: "android", kakao: false });
    assert.deepEqual(detectInAppBrowser(UA.unknownIosApp), { name: "앱", platform: "ios", kakao: false });
  });
  it("leaves real browsers alone", () => {
    for (const ua of [UA.safariIos, UA.chromeIos, UA.chromeAndroid, UA.samsungInternet, UA.chromeMac, "", null])
      assert.equal(detectInAppBrowser(ua), null, String(ua));
  });
});

describe("externalOpenUrl", () => {
  const page = "https://hy-easy.vercel.app/login";
  it("uses KakaoTalk's external-browser scheme", () => {
    const browser = detectInAppBrowser(UA.kakaoIos)!;
    assert.equal(externalOpenUrl(browser, page), `kakaotalk://web/openExternal?url=${encodeURIComponent(page)}`);
  });
  it("uses an Android intent for other Android apps", () => {
    const browser = detectInAppBrowser(UA.unknownAndroidApp)!;
    assert.equal(
      externalOpenUrl(browser, page),
      "intent://hy-easy.vercel.app/login#Intent;scheme=https;action=android.intent.action.VIEW;end",
    );
  });
  it("falls back to copying the link on iOS", () => {
    assert.equal(externalOpenUrl(detectInAppBrowser(UA.instagramIos)!, page), null);
  });
});
