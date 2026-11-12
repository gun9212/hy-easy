import { test } from "node:test";
import assert from "node:assert/strict";
import { planPromptRequeue } from "../worker/requeue";

const base = {
  stale: [
    { postingId: "a", promptVersion: "v1" },
    { postingId: "b", promptVersion: "v1" },
    { postingId: "c", promptVersion: "v2" },
    { postingId: "d", promptVersion: "v1" },
  ],
  currentVersion: "v2",
  runnableQueued: 0,
  queuedIds: new Set<string>(),
  overriddenIds: new Set<string>(),
  hashes: new Map([
    ["a", "ha"],
    ["b", "hb"],
    ["c", "hc"],
    ["d", "hd"],
  ]),
  limit: 5,
};

test("re-queues postings classified under an older prompt with their current hash", () => {
  assert.deepEqual(planPromptRequeue(base), [
    { posting_id: "a", input_hash: "ha" },
    { posting_id: "b", input_hash: "hb" },
    { posting_id: "d", input_hash: "hd" },
  ]);
});

test("waits while new or changed postings are still queued", () => {
  assert.deepEqual(planPromptRequeue({ ...base, runnableQueued: 1 }), []);
});

test("skips queued (including failed), overridden and hashless postings, and respects the limit", () => {
  const plan = planPromptRequeue({
    ...base,
    queuedIds: new Set(["a"]),
    overriddenIds: new Set(["b"]),
    hashes: new Map([["d", "hd"]]),
  });
  assert.deepEqual(plan, [{ posting_id: "d", input_hash: "hd" }]);
  assert.equal(planPromptRequeue({ ...base, limit: 1 }).length, 1);
  assert.deepEqual(planPromptRequeue({ ...base, limit: 0 }), []);
});
