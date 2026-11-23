import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FEEDBACK_MAX_CHARS, feedbackSchema } from "../src/lib/feedback";
import { POST } from "../src/app/api/feedback/route";

describe("feedbackSchema", () => {
  it("accepts a message with the screen path and trims it", () => {
    const parsed = feedbackSchema.parse({ message: "  비교 화면이 좋아요  ", page: "/postings" });
    assert.deepEqual(parsed, { message: "비교 화면이 좋아요", page: "/postings" });
  });
  it("rejects blank and overlong messages", () => {
    assert.equal(feedbackSchema.safeParse({ message: "   " }).success, false);
    assert.equal(feedbackSchema.safeParse({ message: "가".repeat(FEEDBACK_MAX_CHARS + 1) }).success, false);
  });
  it("keeps the page to a plain path, so no query string with filters or ids is stored", () => {
    assert.equal(feedbackSchema.safeParse({ message: "x", page: "/postings?q=삼성" }).success, false);
    assert.equal(feedbackSchema.safeParse({ message: "x", page: "https://evil.example/" }).success, false);
  });
  it("rejects extra fields such as an email", () => {
    assert.equal(feedbackSchema.safeParse({ message: "x", email: "a@hanyang.ac.kr" }).success, false);
  });
});

it("feedback API refuses a cross-origin post before reading the session", async () => {
  const response = await POST(
    new Request("https://example.com/api/feedback", {
      method: "POST",
      headers: { origin: "https://attacker.invalid", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x" }),
    }),
  );
  assert.equal(response.status, 403);
});
