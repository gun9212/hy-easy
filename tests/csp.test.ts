import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, newNonce, pickCspReport, sanitizeCspUri } from "../src/lib/csp";
import { POST as postCspReport } from "../src/app/api/csp-report/route";

test("nonces are random base64 values", () => {
  const a = newNonce();
  assert.match(a, /^[A-Za-z0-9+/]+=*$/);
  assert.notEqual(a, newNonce());
});

test("production policy: nonce + strict-dynamic, no eval, Google sign-in allowed, no framing", () => {
  const csp = buildCsp("abc", false, true);
  assert.match(csp, /script-src 'self' 'nonce-abc' 'strict-dynamic'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /frame-src https:\/\/accounts\.google\.com\/gsi\//);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
});

test("report-only policy leaves out upgrade-insecure-requests", () => {
  assert.doesNotMatch(buildCsp("abc", false, false), /upgrade-insecure-requests/);
});

test("dev policy allows eval for the dev server only", () => {
  assert.match(buildCsp("abc", true), /'unsafe-eval'/);
});

test("sanitizeCspUri removes query strings, fragments, credentials, and opaque payloads", () => {
  assert.equal(
    sanitizeCspUri("https://hy-easy.vercel.app/postings?q=검색어&role=개발#section"),
    "https://hy-easy.vercel.app/postings",
  );
  assert.equal(sanitizeCspUri("https://user:pass@example.com/a/b?token=secret#hash"), "https://example.com/a/b");
  assert.equal(sanitizeCspUri("/postings?q=삼성#top"), "/postings");
  assert.equal(sanitizeCspUri("inline"), "inline");
  assert.equal(sanitizeCspUri("eval"), "eval");
  assert.equal(sanitizeCspUri("data:text/javascript;base64,YWxlcnQoMSk="), "data");
  assert.equal(sanitizeCspUri("blob:https://hy-easy.vercel.app/1234?secret=1#frag"), "blob");
});

test("CSP report route logs sanitized paths without query or fragment", async () => {
  const logged: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  try {
    const req = new Request("https://hy-easy.vercel.app/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify({
        "csp-report": {
          "document-uri": "https://hy-easy.vercel.app/postings?q=한양대&major=컴퓨터#list",
          "violated-directive": "script-src",
          "effective-directive": "script-src",
          "blocked-uri": "https://cdn.example.com/app.js?token=abc#v1",
          "source-file": "https://hy-easy.vercel.app/_next/static/chunk.js?dpl=123#L4",
          "line-number": 4,
        },
      }),
    });
    const res = await postCspReport(req);
    assert.equal(res.status, 204);
    assert.equal(logged.length, 1);
    const parsed = JSON.parse(logged[0]) as Record<string, string>;
    assert.equal(parsed["document-uri"], "https://hy-easy.vercel.app/postings");
    assert.equal(parsed["blocked-uri"], "https://cdn.example.com/app.js");
    assert.equal(parsed["source-file"], "https://hy-easy.vercel.app/_next/static/chunk.js");
    assert.doesNotMatch(logged[0], /\?|#|검색|한양대|token|dpl/);
  } finally {
    console.warn = origWarn;
  }

  assert.deepEqual(
    pickCspReport({
      documentURL: "https://hy-easy.vercel.app/postings?q=secret#frag",
      blockedURL: "inline",
      effectiveDirective: "script-src",
    }),
    {
      "document-uri": "https://hy-easy.vercel.app/postings",
      "blocked-uri": "inline",
      "effective-directive": "script-src",
    },
  );
});
