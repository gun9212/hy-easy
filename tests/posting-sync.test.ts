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

test("merges changed postings, live applicant counts, per-posting lastCheckedAt, and removals in server order", () => {
  const changed = { ...postings[1], title: "새 제목" };
  const fresherCheck = at(base + 24 * 60 * 60_000);
  const merged = mergeSync(postings, {
    full: false,
    postings: [changed],
    live: [
      [postings[1].id, 42, fresherCheck],
      [postings[0].id, postings[0].applicants, postings[0].lastCheckedAt],
      [postings[2].id, postings[2].applicants, fresherCheck],
    ],
    syncedAt: null,
    lastCheckedAt: fresherCheck,
  });
  assert.ok(merged);
  assert.deepEqual(
    merged.map(p => p.id),
    [postings[1].id, postings[0].id, postings[2].id],
  );
  assert.equal(merged[0].title, "새 제목");
  assert.equal(merged[0].applicants, 42);
  assert.equal(merged[0].lastCheckedAt, fresherCheck);
  // Neither applicants nor lastCheckedAt changed: original reference is kept.
  assert.equal(merged[1], postings[0]);
  // Unchanged content with unchanged applicants still receives the fresher per-posting check timestamp.
  assert.equal(merged[2].lastCheckedAt, fresherCheck);
  assert.equal(merged[2].applicants, postings[2].applicants);

  // buildSync emits per-posting lastCheckedAt in live rows even when postings[] is empty.
  const quiet = buildSync(
    postings.map(p => ({ ...p, lastCheckedAt: fresherCheck })),
    at(base + 3 * 60 * 60_000),
  );
  assert.equal(quiet.full, false);
  assert.equal(quiet.postings.length, 0);
  assert.deepEqual(quiet.live[0], [postings[0].id, postings[0].applicants, fresherCheck]);
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

test("server cache reads once per minute and shares concurrent reads among DB-verified school users", async () => {
  const { cachedPostings, POSTING_CACHE_TTL_MS, resetPostingCacheForTest } = await import("../src/lib/posting-cache");
  resetPostingCacheForTest();
  let reads = 0;
  let schoolChecks = 0;
  const makeDb = (isSchool: boolean, delayMs = 0) =>
    ({
      rpc: async (name: string) => {
        assert.equal(name, "is_school_user");
        schoolChecks += 1;
        return { data: isSchool, error: null };
      },
      from: () => ({
        select: () => ({
          order: async () => {
            reads += 1;
            if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
            return { data: isSchool ? postings.map(p => ({ document: p })) : [], error: null };
          },
        }),
      }),
    }) as unknown as Parameters<typeof cachedPostings>[0];

  const schoolDb = makeDb(true, 15);
  const blockedDb = makeDb(false);
  const now = Date.now();

  // Cache miss: blocked user is rejected before touching posting_view.
  await assert.rejects(() => cachedPostings(blockedDb, now), { status: 403 });
  assert.equal(reads, 0);

  // Concurrent misses: verified users share one read while a concurrent ineligible user is still rejected with 403.
  const pA = cachedPostings(schoolDb, now);
  const pB = cachedPostings(schoolDb, now);
  const pBlocked = assert.rejects(() => cachedPostings(blockedDb, now), { status: 403 });
  const [a, b] = await Promise.all([pA, pB, pBlocked]);
  assert.equal(reads, 1);
  assert.equal(a, b);

  // Cache hit: verified user gets cached postings, ineligible user gets the same 403 rejection.
  const hit = await cachedPostings(schoolDb, now + 1000);
  assert.equal(hit, a);
  assert.equal(reads, 1);
  await assert.rejects(() => cachedPostings(blockedDb, now + 1000), { status: 403 });
  assert.equal(reads, 1);
  assert.equal(schoolChecks, 6);

  // After TTL expires, verified user refreshes the cache.
  await cachedPostings(schoolDb, Date.now() + POSTING_CACHE_TTL_MS + 1);
  assert.equal(reads, 2);

  // RPC failure fails closed even when cache is warm.
  const brokenDb = {
    rpc: async () => ({ data: null, error: { message: "rpc unavailable" } }),
  } as unknown as Parameters<typeof cachedPostings>[0];
  await assert.rejects(() => cachedPostings(brokenDb, Date.now()), /rpc unavailable/);
});
