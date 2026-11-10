import { it } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin, HttpError } from "../src/lib/auth";
import { GET } from "../src/app/api/postings/route";
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
