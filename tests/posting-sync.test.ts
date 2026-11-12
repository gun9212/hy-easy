import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePostings } from "../src/lib/sample";
import { buildSync, mergeSync, SYNC_OVERLAP_MS } from "../src/lib/posting-sync";
import type { Posting } from "../src/lib/domain";

const at = (ms: number) => new Date(ms).toISOString();
const base = Date.parse("2026-11-12T00:00:00Z");
const postings: Posting[] = samplePostings.slice(0, 3).map((p, i) => ({
  ...p,
  changedAt: at(base + i * 60 * 60_000),
  lastCheckedAt: at(base + 10 * 60 * 60_000 + i),
}));

test("sends everything without a valid since, with the newest change and check times", () => {
  for (const since of [null, "not-a-date"]) {
    const reply = buildSync(postings, since);
    assert.equal(reply.full, true);
    assert.equal(reply.postings.length, 3);
    assert.equal(reply.syncedAt, postings[2].changedAt);
    assert.equal(reply.lastCheckedAt, postings[2].lastCheckedAt);
    assert.deepEqual(
      reply.live.map(([id]) => id),
      postings.map(p => p.id),
    );
  }
});

test("sends only postings changed after since, minus the overlap", () => {
  const since = at(base + 2 * 60 * 60_000 + SYNC_OVERLAP_MS - 1);
  const reply = buildSync(postings, since);
  assert.equal(reply.full, false);
  assert.deepEqual(
    reply.postings.map(p => p.id),
    [postings[2].id],
  );
  assert.equal(buildSync(postings, at(base + 3 * 60 * 60_000)).postings.length, 0);
});

test("merges changed postings, live applicant counts and removals in server order", () => {
  const changed = { ...postings[1], title: "새 제목" };
  const merged = mergeSync(postings, {
    full: false,
    postings: [changed],
    live: [
      [postings[1].id, 42],
      [postings[0].id, postings[0].applicants],
    ],
    syncedAt: null,
    lastCheckedAt: null,
  });
  assert.ok(merged);
  assert.deepEqual(
    merged.map(p => p.id),
    [postings[1].id, postings[0].id],
  );
  assert.equal(merged[0].title, "새 제목");
  assert.equal(merged[0].applicants, 42);
  assert.equal(merged[1], postings[0]);
});

test("asks for a full reload when a listed posting is missing from both copies", () => {
  const reply = {
    full: false,
    postings: [],
    live: [["unknown", null]] as [string, null][],
    syncedAt: null,
    lastCheckedAt: null,
  };
  assert.equal(mergeSync(postings, reply), null);
});

test("server cache reads once per minute and shares concurrent reads", async () => {
  const { cachedPostings, POSTING_CACHE_TTL_MS } = await import("../src/lib/posting-cache");
  let reads = 0;
  const db = {
    from: () => ({
      select: () => ({
        order: async () => {
          reads += 1;
          return { data: postings.map(p => ({ document: p })), error: null };
        },
      }),
    }),
  } as unknown as Parameters<typeof cachedPostings>[0];
  const now = Date.now();
  const [a, b] = await Promise.all([cachedPostings(db, now), cachedPostings(db, now)]);
  assert.equal(reads, 1);
  assert.equal(a, b);
  await cachedPostings(db, now + 1000);
  assert.equal(reads, 1);
  await cachedPostings(db, Date.now() + POSTING_CACHE_TTL_MS + 1);
  assert.equal(reads, 2);
});
