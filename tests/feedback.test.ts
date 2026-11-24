import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_FEEDBACK_PAGE_SIZE,
  adminFeedbackMarkReadSchema,
  FEEDBACK_MAX_CHARS,
  feedbackSchema,
  parseFeedbackQuery,
} from "../src/lib/feedback";
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

describe("admin feedback filter, pagination, and bulk-read schema", () => {
  it("parses unread filter and clamps page numbers safely", () => {
    assert.deepEqual(parseFeedbackQuery({}), { filter: "all", page: 1 });
    assert.deepEqual(parseFeedbackQuery({ feedback: "unread", feedbackPage: "3" }), { filter: "unread", page: 3 });
    assert.deepEqual(parseFeedbackQuery({ feedback: ["unread", "all"], feedbackPage: ["2", "9"] }), {
      filter: "unread",
      page: 2,
    });
    assert.deepEqual(parseFeedbackQuery({ feedback: "other", feedbackPage: "-5" }), { filter: "all", page: 1 });
    assert.deepEqual(parseFeedbackQuery({ feedbackPage: "not-a-number" }), { filter: "all", page: 1 });
  });

  it("validates single-id, page-ids, and all-unread payloads", () => {
    const u1 = "00000000-0000-4000-8000-000000000001";
    const u2 = "00000000-0000-4000-8000-000000000002";
    assert.equal(adminFeedbackMarkReadSchema.safeParse({}).success, true);
    assert.equal(adminFeedbackMarkReadSchema.safeParse({ id: u1 }).success, true);
    assert.equal(adminFeedbackMarkReadSchema.safeParse({ ids: [u1, u2] }).success, true);
    assert.equal(adminFeedbackMarkReadSchema.safeParse({ id: u1, ids: [u2] }).success, false);
    assert.equal(adminFeedbackMarkReadSchema.safeParse({ ids: [] }).success, false);
    assert.equal(
      adminFeedbackMarkReadSchema.safeParse({ ids: Array.from({ length: ADMIN_FEEDBACK_PAGE_SIZE + 1 }, () => u1) })
        .success,
      false,
    );
  });
});
