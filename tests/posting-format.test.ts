import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Posting } from "../src/lib/domain";
import {
  competitionRatio,
  deadlineShort,
  isClosingSoon,
  matchesWhen,
  nextDeadline,
  stipendParts,
} from "../src/lib/posting-format";
import { samplePostings } from "../src/lib/sample";

const NOW = new Date("2026-11-13T02:00:00.000Z"); // 11:00 KST
const base = samplePostings[0];
const at = (date: string, iso: string, id = date): Posting => ({
  ...base,
  id,
  recruitment: "open",
  deadline: { raw: date, at: iso, date, precision: "minute" },
});

describe("isClosingSoon / matchesWhen", () => {
  it("open postings within three Seoul days are closing soon", () => {
    assert.equal(isClosingSoon(at("2026-11-16", "2026-11-16T09:00:00.000Z"), NOW), true);
    assert.equal(isClosingSoon(at("2026-11-17", "2026-11-17T09:00:00.000Z"), NOW), false);
    assert.equal(isClosingSoon(at("2026-11-13", "2026-11-13T01:00:00.000Z"), NOW), false); // already closed
  });

  it("the new shortcut uses the first-seen day", () => {
    const fresh = { ...base, firstSeenAt: "2026-11-13T00:30:00.000Z" };
    const old = { ...base, firstSeenAt: "2026-11-10T00:30:00.000Z" };
    assert.equal(matchesWhen(fresh, "new", NOW), true);
    assert.equal(matchesWhen(old, "new", NOW), false);
    assert.equal(matchesWhen(old, undefined, NOW), true);
  });
});

describe("nextDeadline", () => {
  it("picks the open posting that closes first", () => {
    const closed = at("2026-11-13", "2026-11-13T01:00:00.000Z", "closed");
    const later = at("2026-11-20", "2026-11-20T09:00:00.000Z", "later");
    const first = at("2026-11-14", "2026-11-14T09:00:00.000Z", "first");
    assert.equal(nextDeadline([later, closed, first], NOW)?.id, "first");
    assert.equal(nextDeadline([closed], NOW), null);
  });
});

describe("stipendParts / competitionRatio", () => {
  it("splits monthly and hourly pay", () => {
    const pay = (amount: number | null, unit: Posting["stipend"]["unit"]): Posting => ({
      ...base,
      stipend: { amount, unit, raw: "" },
    });
    assert.deepEqual(stipendParts(pay(2_236_300, "month")), { prefix: "월", amount: "224", suffix: "만원" });
    assert.deepEqual(stipendParts(pay(10_030, "hour")), { prefix: "시급", amount: "10,030", suffix: "원" });
    assert.equal(stipendParts(pay(null, "month")), null);
    assert.equal(stipendParts(pay(2_000_000, "unknown")), null);
  });

  it("divides applicants by openings", () => {
    assert.equal(competitionRatio({ ...base, applicants: 7, headcount: 2 }), "3.5 : 1");
    assert.equal(competitionRatio({ ...base, applicants: 0, headcount: 3 }), "0.0 : 1");
    assert.equal(competitionRatio({ ...base, applicants: null, headcount: 3 }), "-");
    assert.equal(competitionRatio({ ...base, applicants: 4, headcount: null }), "-");
  });
});

describe("deadlineShort", () => {
  it("shows Seoul time, and 24:00 for a midnight cutoff beside its own date", () => {
    assert.equal(deadlineShort(at("2026-11-13", "2026-11-13T09:00:00.000Z")), "11.13 18:00");
    assert.equal(deadlineShort(at("2026-11-13", "2026-11-13T15:00:00.000Z")), "11.13 24:00");
    assert.equal(
      deadlineShort({ ...base, deadline: { raw: "2026-11-20", at: null, date: "2026-11-20", precision: "date" } }),
      "11.20",
    );
    assert.equal(
      deadlineShort({ ...base, deadline: { raw: "", at: null, date: null, precision: "unknown" } }),
      "마감 미기재",
    );
  });
});
