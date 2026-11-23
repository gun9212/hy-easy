import { it } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin, HttpError } from "../src/lib/auth";
import { GET } from "../src/app/api/postings/route";
import { DELETE as deleteApplication } from "../src/app/api/applications/[id]/route";
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
