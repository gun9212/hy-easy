import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detailFailureStreak, failedStreak } from "../src/components/admin/admin-alerts";
import type { Run } from "../src/components/admin/admin-tables";

const run = (status: string, error_code: string | null = null): Run => ({
  id: Math.random().toString(),
  started_at: "2026-11-13T00:00:00Z",
  finished_at: null,
  status,
  checked: 0,
  changed: 0,
  error_code,
});

test("counts failed runs from the newest, skipping running and skipped runs", () => {
  const runs = [
    run("running"),
    run("session_expired", "LOGIN_FAILED"),
    run("skipped"),
    run("failed", "COLLECTION_FAILED"),
    run("failed"),
    run("success"),
    run("failed"),
  ];
  assert.deepEqual(failedStreak(runs), { count: 3, errorCode: "LOGIN_FAILED" });
});

test("a newest success means no streak", () => {
  assert.equal(failedStreak([run("success"), run("failed"), run("failed")]).count, 0);
  assert.equal(failedStreak([]).count, 0);
});

test("keeps counting streak when automatic login is blocked", () => {
  const runs = [
    run("session_expired", "LOGIN_BLOCKED"),
    run("session_expired", "LOGIN_FAILED"),
    run("session_expired", "LOGIN_FAILED"),
    run("session_expired", "LOGIN_FAILED"),
  ];
  assert.deepEqual(failedStreak(runs), { count: 4, errorCode: "LOGIN_BLOCKED" });
});

test("counts consecutive DETAIL_READ_FAILED partial runs while ignoring normal CHECKPOINT_SAVED runs", () => {
  const degraded = [
    run("running"),
    run("partial", "DETAIL_READ_FAILED"),
    run("skipped"),
    run("partial", "DETAIL_READ_FAILED"),
    run("partial", "DETAIL_READ_FAILED"),
    run("partial", "CHECKPOINT_SAVED"),
    run("partial", "DETAIL_READ_FAILED"),
  ];
  assert.equal(detailFailureStreak(degraded), 3);

  const normalCheckpoint = [
    run("partial", "CHECKPOINT_SAVED"),
    run("partial", "DETAIL_READ_FAILED"),
    run("partial", "DETAIL_READ_FAILED"),
    run("partial", "DETAIL_READ_FAILED"),
  ];
  assert.equal(detailFailureStreak(normalCheckpoint), 0);

  const tf = readFileSync(path.join(process.cwd(), "infra", "monitoring.tf"), "utf8");
  assert.match(tf, /hy_easy_detail_read_failed/);
  assert.match(tf, /hy_easy_collector_detail_degraded/);
  assert.match(tf, /DETAIL_READ_FAILED/);
});
