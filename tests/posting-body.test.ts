import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterPostings, type Posting } from "../src/lib/domain";
import { toListPosting } from "../src/lib/posting-body";
import { buildSync } from "../src/lib/posting-sync";
import { samplePostings } from "../src/lib/sample";

const withAttachment: Posting = {
  ...samplePostings[0],
  attachment: {
    fileName: "plan.pdf",
    fileHash: "abc",
    pages: 3,
    text: "첨부에만 있는 쿠버네티스 업무",
    truncated: false,
    extractedAt: "2026-11-24T00:00:00Z",
  },
};

describe("list copies for the browser sync", () => {
  it("leaves out source texts, attachment text and evidence quotes, and marks the copy", () => {
    const list = toListPosting(withAttachment);
    assert.equal(list.bodyOmitted, true);
    for (const field of ["practiceInfo", "qualifications", "tasks", "benefits"] as const) assert.equal(list[field], "");
    assert.equal(list.attachment?.text, "");
    assert.equal(list.attachment?.fileName, "plan.pdf");
    assert.deepEqual(list.classification?.evidence, []);
    // What the list, cards, filters and planner use stays.
    assert.equal(list.title, withAttachment.title);
    assert.equal(list.classification?.summary, withAttachment.classification?.summary);
    assert.deepEqual(list.events, withAttachment.events);
    assert.deepEqual(list.deadline, withAttachment.deadline);
  });

  it("does not change the full posting it was given", () => {
    const before = structuredClone(withAttachment);
    toListPosting(withAttachment);
    assert.deepEqual(withAttachment, before);
  });

  it("sync replies carry list copies only, for full and incremental replies", () => {
    const full = buildSync([withAttachment, ...samplePostings.slice(1)], null);
    assert.equal(full.postings.length, samplePostings.length);
    assert.ok(full.postings.every(p => p.bodyOmitted && p.tasks === "" && p.qualifications === ""));
    const changed = buildSync([{ ...withAttachment, changedAt: "2030-01-01T00:00:00Z" }], "2029-12-31T00:00:00Z");
    assert.equal(changed.postings.length, 1);
    assert.equal(changed.postings[0].attachment?.text, "");
  });
});

describe("search over list copies", () => {
  const list = samplePostings.map(toListPosting);
  const target = list.find(p => p.id === withAttachment.id)!;

  it("still matches company and title in the browser", () => {
    const ids = filterPostings(list, { q: target.company }, []).map(p => p.id);
    assert.ok(ids.includes(target.id));
  });

  it("matches body-only words through the server's ids and not without them", () => {
    const word = "쿠버네티스";
    assert.equal(filterPostings(list, { q: word }, []).length, 0);
    const ids = filterPostings(list, { q: word }, [], null, new Set([target.id])).map(p => p.id);
    assert.deepEqual(ids, [target.id]);
  });

  it("gives the same result as the full-text search when the server ids come from the full postings", () => {
    const fullPostings = [withAttachment, ...samplePostings.slice(1)];
    for (const q of ["쿠버네티스", "인턴", samplePostings[1].tasks.slice(0, 6)]) {
      const expected = filterPostings(fullPostings, { q }, []).map(p => p.id);
      const serverIds = new Set(expected);
      const actual = filterPostings(fullPostings.map(toListPosting), { q }, [], null, serverIds).map(p => p.id);
      assert.deepEqual(actual, expected, q);
    }
  });
});

describe("POST /api/postings/search", () => {
  it("rejects cross-origin requests before reading the session", async () => {
    const { POST } = await import("../src/app/api/postings/search/route");
    const response = await POST(
      new Request("https://example.com/api/postings/search", {
        method: "POST",
        headers: { origin: "https://attacker.invalid", "content-type": "application/json" },
        body: JSON.stringify({ q: "인턴" }),
      }),
    );
    assert.equal(response.status, 403);
  });
});
