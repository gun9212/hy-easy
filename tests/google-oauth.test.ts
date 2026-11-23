import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeUrl,
  hashNonce,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
  readCookie,
  stateMatches,
} from "../src/lib/google-oauth";
import { GET as callback } from "../src/app/auth/google/callback/route";
import { GET as login } from "../src/app/auth/login/route";

describe("authorizeUrl", () => {
  const url = new URL(
    authorizeUrl({ clientId: "client", origin: "https://hy-easy.vercel.app", state: "s1", nonce: "raw" }),
  );
  it("sends Google back to this site's callback, not the Supabase domain", () => {
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("redirect_uri"), "https://hy-easy.vercel.app/auth/google/callback");
  });
  it("asks for an ID token for a school account and carries state and the hashed nonce", () => {
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("scope"), "openid email profile");
    assert.equal(url.searchParams.get("hd"), "hanyang.ac.kr");
    assert.equal(url.searchParams.get("state"), "s1");
    assert.equal(url.searchParams.get("nonce"), hashNonce("raw"));
    assert.notEqual(url.searchParams.get("nonce"), "raw");
  });
});

describe("stateMatches", () => {
  it("accepts only the exact state", () => {
    assert.equal(stateMatches("abc", "abc"), true);
    assert.equal(stateMatches("abc", "abd"), false);
    assert.equal(stateMatches("abc", "abcd"), false);
    assert.equal(stateMatches(undefined, "abc"), false);
    assert.equal(stateMatches("abc", null), false);
  });
});

it("readCookie finds one cookie among several", () => {
  const request = new Request("https://x.test", { headers: { cookie: `a=1; ${OAUTH_STATE_COOKIE}=s%201; b=2` } });
  assert.equal(readCookie(request, OAUTH_STATE_COOKIE), "s 1");
  assert.equal(readCookie(request, "missing"), undefined);
});

describe("/auth/google/callback", () => {
  const call = (query: string, cookie?: string) =>
    callback(
      new Request(`https://hy-easy.vercel.app/auth/google/callback${query}`, { headers: cookie ? { cookie } : {} }),
    );

  it("rejects a callback whose state does not match this browser's cookie", async () => {
    const response = await call("?code=c&state=forged", `${OAUTH_STATE_COOKIE}=real; ${OAUTH_NONCE_COOKIE}=n`);
    assert.equal(response.status, 307);
    assert.equal(
      new URL(response.headers.get("location")!).pathname + new URL(response.headers.get("location")!).search,
      "/login?error=oauth",
    );
  });
  it("rejects a callback with no cookies at all", async () => {
    const response = await call("?code=c&state=s");
    assert.match(response.headers.get("location") ?? "", /\/login\?error=oauth$/);
  });
  it("clears the one-time cookies on the way out", async () => {
    const response = await call("?code=c&state=forged", `${OAUTH_STATE_COOKIE}=real`);
    const cleared = response.headers.getSetCookie().filter(c => /Max-Age=0/i.test(c));
    assert.equal(cleared.length, 2);
  });
});

it("/auth/login without Supabase settings goes back to the login page", async () => {
  const old = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const response = await login(new Request("https://hy-easy.vercel.app/auth/login"));
    assert.match(response.headers.get("location") ?? "", /\/login\?error=setup$/);
  } finally {
    if (old) process.env.NEXT_PUBLIC_SUPABASE_URL = old;
  }
});
