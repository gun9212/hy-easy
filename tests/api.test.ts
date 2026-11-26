import { it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { isSameOrigin, requestOrigin, sameOrigin, HttpError } from "../src/lib/auth";
import { performLogout, supabaseAuthCookieNames } from "../src/lib/auth-cookies";
import { GET } from "../src/app/api/postings/route";
import { DELETE as deleteApplication } from "../src/app/api/applications/[id]/route";
import { POST as submitFeedback } from "../src/app/api/feedback/route";
import { POST as googleSignIn } from "../src/app/auth/google/route";
import { POST as logout } from "../src/app/auth/logout/route";
it("Supabase 미연결 시 실제 공고 API가 샘플을 반환하지 않음", async () => {
  const old = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const response = await GET(new Request("http://localhost:3000/api/postings"));
    assert.equal(response.status, 503);
    assert.equal("items" in (await response.json()), false);
  } finally {
    if (old) process.env.NEXT_PUBLIC_SUPABASE_URL = old;
  }
});
it("교차 출처 쓰기 요청 거절", () =>
  assert.throws(
    () =>
      sameOrigin(
        new Request("https://example.com/api/applications", { headers: { origin: "https://attacker.invalid" } }),
      ),
    HttpError,
  ));
it("동일 출처 쓰기 요청 허용", () =>
  assert.doesNotThrow(() =>
    sameOrigin(new Request("https://example.com/api/applications", { headers: { origin: "https://example.com" } })),
  ));
it("로그아웃은 세션이 없어도 동일 출처면 로그인 화면으로 이동", async () => {
  const old = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const response = await logout(
      new Request("https://example.com/auth/logout", {
        method: "POST",
        headers: { origin: "https://example.com" },
      }),
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://example.com/login");
  } finally {
    if (old) process.env.NEXT_PUBLIC_SUPABASE_URL = old;
  }
});
it("교차 출처 로그아웃과 지원 삭제는 거절", async () => {
  const logoutResponse = await logout(
    new Request("https://example.com/auth/logout", {
      method: "POST",
      headers: { origin: "https://attacker.invalid" },
    }),
  );
  assert.equal(logoutResponse.status, 403);
  const deleteResponse = await deleteApplication(
    new Request("https://example.com/api/applications/00000000-0000-4000-8000-000000000001", {
      method: "DELETE",
      headers: { origin: "https://attacker.invalid" },
    }),
    { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) },
  );
  assert.equal(deleteResponse.status, 403);
});
it("인증 서버 토큰 철회가 실패해도 세션 쿠키와 청크를 모두 만료시키고 실패를 별도로 기록", async () => {
  const loggedCodes: string[] = [];
  let localFallbackCalled = false;
  const response = await performLogout(
    new Request("https://hy-easy.vercel.app/auth/logout", {
      method: "POST",
      headers: {
        origin: "https://hy-easy.vercel.app",
        cookie:
          "hy_theme=dark; sb-projref-auth-token.0=chunk0-secret; sb-projref-auth-token.1=chunk1-secret; sb-projref-auth-token-code-verifier=pkce",
      },
    }),
    {
      isConfigured: () => true,
      supabaseUrl: () => "https://projref.supabase.co",
      createClient: async () => ({
        auth: {
          signOut: async options => {
            if (options?.scope === "local") {
              localFallbackCalled = true;
              throw new Error("local signOut failed");
            }
            return { error: { status: 503, message: "auth server down chunk0-secret" } };
          },
        },
      }),
      readJarCookieNames: async () => ["sb-projref-auth-token.2"],
      logRevocationFailure: code => loggedCodes.push(code),
    },
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://hy-easy.vercel.app/login");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(localFallbackCalled, true);
  assert.deepEqual(loggedCodes, ["HTTP_503"]);

  const setCookies = response.headers.getSetCookie();
  const expiredNames = setCookies.map(line => line.split("=")[0]);
  for (const name of [
    "sb-projref-auth-token",
    "sb-projref-auth-token-code-verifier",
    "sb-projref-auth-token.0",
    "sb-projref-auth-token.1",
    "sb-projref-auth-token.2",
  ]) {
    assert.ok(expiredNames.includes(name), `expected ${name} to be expired`);
    const header = setCookies.find(line => line.startsWith(`${name}=`))!;
    assert.match(header, /Max-Age=0/);
    assert.match(header, /Path=\//);
    assert.match(header, /Secure/);
    assert.equal(header.includes("chunk0-secret"), false);
  }
  assert.equal(expiredNames.includes("hy_theme"), false);
  assert.deepEqual(
    supabaseAuthCookieNames(["hy_theme", "sb-abc-auth-token.0", "sb-abc-auth-token.1"], "https://abc.supabase.co"),
    ["sb-abc-auth-token", "sb-abc-auth-token-code-verifier", "sb-abc-auth-token.0", "sb-abc-auth-token.1"],
  );
});
it("NextRequest가 127.0.0.1과 [::1]을 localhost로 바꾸더라도 동일 루프백 Origin을 허용하고 교차 호스트·포트·외부 Host는 거절", async () => {
  const loopbackPost = new NextRequest("http://127.0.0.1:3000/api/feedback", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ message: "x" }),
  });
  // Guard that NextRequest still normalizes 127.0.0.1 -> localhost in request.url (the root cause of BUG-02).
  assert.equal(loopbackPost.url, "http://localhost:3000/api/feedback");
  assert.equal(requestOrigin(loopbackPost), "http://127.0.0.1:3000");
  assert.doesNotThrow(() => sameOrigin(loopbackPost));

  const ipv6Loopback = new NextRequest("http://[::1]:3000/api/feedback", {
    method: "POST",
    headers: { host: "[::1]:3000", origin: "http://[::1]:3000" },
  });
  assert.equal(ipv6Loopback.url, "http://localhost:3000/api/feedback");
  assert.doesNotThrow(() => sameOrigin(ipv6Loopback));

  // Different loopback hostname or port must still be rejected.
  assert.throws(
    () =>
      sameOrigin(
        new NextRequest("http://127.0.0.1:3000/api/feedback", {
          method: "POST",
          headers: { host: "127.0.0.1:3000", origin: "http://localhost:3000" },
        }),
      ),
    HttpError,
  );
  assert.throws(
    () =>
      sameOrigin(
        new NextRequest("http://127.0.0.1:3000/api/feedback", {
          method: "POST",
          headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:8080" },
        }),
      ),
    HttpError,
  );
  // Spoofed non-loopback Host headers are ignored on both loopback and production URLs.
  assert.equal(
    isSameOrigin(
      new NextRequest("http://127.0.0.1:3000/api/feedback", {
        method: "POST",
        headers: { host: "evil.example:3000", origin: "http://evil.example:3000" },
      }),
    ),
    false,
  );
  assert.equal(
    isSameOrigin(
      new NextRequest("https://hy-easy.vercel.app/api/feedback", {
        method: "POST",
        headers: { host: "evil.example", origin: "https://evil.example" },
      }),
    ),
    false,
  );

  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    // Unconfigured Supabase makes requireUser() throw 503 right after sameOrigin() succeeds (vs 403 on Origin mismatch).
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const feedbackRes = await submitFeedback(loopbackPost);
    assert.equal(feedbackRes.status, 503);

    const logoutRes = await logout(
      new NextRequest("http://127.0.0.1:3000/auth/logout", {
        method: "POST",
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    );
    assert.equal(logoutRes.status, 303);
    assert.equal(logoutRes.headers.get("location"), "http://127.0.0.1:3000/login");

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projref.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    const googleRes = await googleSignIn(
      new NextRequest("http://127.0.0.1:3000/auth/google", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(googleRes.status, 400);

    const googleCrossLoopback = await googleSignIn(
      new NextRequest("http://127.0.0.1:3000/auth/google", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(googleCrossLoopback.status, 403);
  } finally {
    if (oldUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (oldKey) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
    else delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});
