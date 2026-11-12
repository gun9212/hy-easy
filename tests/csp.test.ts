import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, newNonce } from "../src/lib/csp";

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
