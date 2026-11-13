import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deadlineGroup, groupByDeadline } from "../src/lib/deadline-groups";
import type { Posting } from "../src/lib/domain";
import { samplePostings } from "../src/lib/sample";

const NOW = new Date("2026-11-13T02:00:00.000Z"); // 11:00 KST
const base = samplePostings[0];
function posting(deadline: Posting["deadline"], recruitment: Posting["recruitment"] = "open"): Posting {
  return { ...base, deadline, recruitment };
}
const minute = (date: string, at: string) => ({ raw: date, at, date, precision: "minute" as const });

describe("deadlineGroup", () => {
  it("counts Seoul calendar days", () => {
    assert.equal(deadlineGroup(posting(minute("2026-11-13", "2026-11-13T09:00:00.000Z")), NOW), "3일 안에 마감");
    assert.equal(deadlineGroup(posting(minute("2026-11-16", "2026-11-16T09:00:00.000Z")), NOW), "3일 안에 마감");
    assert.equal(deadlineGroup(posting(minute("2026-11-17", "2026-11-17T09:00:00.000Z")), NOW), "이번 주 마감");
    assert.equal(deadlineGroup(posting(minute("2026-11-20", "2026-11-20T09:00:00.000Z")), NOW), "이번 주 마감");
    assert.equal(deadlineGroup(posting(minute("2026-11-21", "2026-11-21T09:00:00.000Z")), NOW), "다음 주 이후");
  });

  it("a '24시까지' deadline stays open for the rest of its day", () => {
    // Stored as the next day's 00:00 KST.
    assert.equal(deadlineGroup(posting(minute("2026-11-13", "2026-11-13T15:00:00.000Z")), NOW), "3일 안에 마감");
  });

  it("past deadlines and closed recruitment are closed", () => {
    assert.equal(deadlineGroup(posting(minute("2026-11-13", "2026-11-13T01:00:00.000Z")), NOW), "마감된 공고");
    assert.equal(
      deadlineGroup(posting(minute("2026-11-30", "2026-11-30T09:00:00.000Z"), "closed"), NOW),
      "마감된 공고",
    );
  });

  it("no deadline date is its own group", () => {
    assert.equal(deadlineGroup(posting({ raw: "", at: null, date: null, precision: "unknown" }), NOW), "마감일 미정");
  });
});

describe("groupByDeadline", () => {
  it("returns non-empty groups in a fixed order and keeps each group's order", () => {
    const later = { ...posting(minute("2026-11-25", "2026-11-25T09:00:00.000Z")), id: "later" };
    const soon = { ...posting(minute("2026-11-14", "2026-11-14T09:00:00.000Z")), id: "soon" };
    const soon2 = { ...posting(minute("2026-11-15", "2026-11-15T09:00:00.000Z")), id: "soon2" };
    const groups = groupByDeadline([later, soon2, soon], NOW);
    assert.deepEqual(
      groups.map(([g, items]) => [g, items.map(p => p.id)]),
      [
        ["3일 안에 마감", ["soon2", "soon"]],
        ["다음 주 이후", ["later"]],
      ],
    );
  });
});
