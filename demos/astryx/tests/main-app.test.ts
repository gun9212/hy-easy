import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthCookieName, mainAppUrl, sessionReason, trustedHostname } from "../src/lib/main-app.ts";

test("loopback hosts are kept so the link shares the demo's cookies", () => {
  assert.equal(trustedHostname("localhost:3100"), "localhost");
  assert.equal(trustedHostname("127.0.0.1:3100"), "127.0.0.1");
  assert.equal(trustedHostname("[::1]:3100"), "[::1]");
  assert.equal(trustedHostname("LOCALHOST"), "localhost");
});

test("any other Host header falls back to 127.0.0.1", () => {
  assert.equal(trustedHostname("evil.example:3100"), "127.0.0.1");
  assert.equal(trustedHostname("localhost.evil.example"), "127.0.0.1");
  assert.equal(trustedHostname(""), "127.0.0.1");
  assert.equal(trustedHostname(null), "127.0.0.1");
});

test("main app links point at port 3000 on the trusted host", () => {
  assert.equal(mainAppUrl("localhost:3100", "/login"), "http://localhost:3000/login");
  assert.equal(mainAppUrl("evil.example", "postings"), "http://127.0.0.1:3000/postings");
});

test("session reasons tell an expired session from a missing one", () => {
  assert.equal(sessionReason({ hasAuthCookie: false, hasValidClaims: false, isSchool: false }), "signed-out");
  assert.equal(sessionReason({ hasAuthCookie: true, hasValidClaims: false, isSchool: false }), "expired");
  assert.equal(sessionReason({ hasAuthCookie: true, hasValidClaims: true, isSchool: false }), "not-school");
  assert.equal(sessionReason({ hasAuthCookie: true, hasValidClaims: true, isSchool: true }), "live");
});

test("auth cookie names include the chunked form", () => {
  assert.equal(isAuthCookieName("sb-dcygwmhxppyymnqlmnsh-auth-token"), true);
  assert.equal(isAuthCookieName("sb-dcygwmhxppyymnqlmnsh-auth-token.1"), true);
  assert.equal(isAuthCookieName("sb-dcygwmhxppyymnqlmnsh-auth-token-code-verifier"), false);
  assert.equal(isAuthCookieName("session"), false);
});
