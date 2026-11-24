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
          order: () => ({
            order: () => ({
              range: async (from: number, to: number) => {
                reads += 1;
                if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
                const rows = isSchool ? postings.map(p => ({ document: p })) : [];
                return { data: rows.slice(from, to + 1), count: rows.length, error: null };
              },
            }),
          }),
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

test("loadPostings paginates in deterministic (first_seen_at desc, id asc) order past PostgREST row caps", async () => {
  const { loadPostings } = await import("../src/lib/data");
  const five = samplePostings.slice(0, 5);
  const orders: Array<[string, boolean]> = [];
  const ranges: Array<[number, number]> = [];
  // Simulate a server max_rows cap of 2 rows even though the client asks for pageSize = 4.
  const SERVER_MAX_ROWS = 2;
  const db = {
    from: (table: string) => {
      assert.equal(table, "posting_view");
      return {
        select: () => ({
          order: (col1: string, opt1: { ascending: boolean }) => {
            orders.push([col1, opt1.ascending]);
            return {
              order: (col2: string, opt2: { ascending: boolean }) => {
                orders.push([col2, opt2.ascending]);
                return {
                  range: async (from: number, to: number) => {
                    ranges.push([from, to]);
                    const end = Math.min(to + 1, from + SERVER_MAX_ROWS);
                    return { data: five.slice(from, end).map(p => ({ document: p })), count: five.length, error: null };
                  },
                };
              },
            };
          },
        }),
      };
    },
  } as unknown as Parameters<typeof loadPostings>[0];

  const loaded = await loadPostings(db, 4);
  assert.deepEqual(
    loaded.map(p => p.id),
    five.map(p => p.id),
  );
  assert.deepEqual(ranges, [
    [0, 3],
    [2, 5],
    [4, 7],
  ]);
  assert.deepEqual(orders.slice(0, 2), [
    ["first_seen_at", false],
    ["id", true],
  ]);
});

test("loadPostings rejects truncated reads and mergeSync preserves cached rows when reply is incomplete", async () => {
  const { loadPostings } = await import("../src/lib/data");
  const truncatedDb = {
    from: () => ({
      select: () => ({
        order: () => ({
          order: () => ({
            range: async (from: number) => ({
              data: from === 0 ? [{ document: postings[0] }] : [],
              count: 3,
              error: null,
            }),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof loadPostings>[0];

  await assert.rejects(() => loadPostings(truncatedDb, 1), /Incomplete posting read/);

  const partial = mergeSync(postings, {
    full: false,
    complete: false,
    postings: [],
    live: [[postings[0].id, 99, postings[0].lastCheckedAt]],
    syncedAt: null,
    lastCheckedAt: null,
  });
  assert.ok(partial);
  assert.deepEqual(
    partial.map(p => p.id),
    postings.map(p => p.id),
  );
  assert.equal(partial[0].applicants, 99);
});
