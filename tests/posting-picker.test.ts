import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postingOptionLabel, searchPostings } from "../src/lib/posting-picker";
import type { Posting } from "../src/lib/domain";
import { samplePostings } from "../src/lib/sample";

const base = samplePostings[0];
const make = (id: string, company: string, title: string, department: string): Posting => ({
  ...base,
  id,
  company,
  title,
  department,
  deadline: { raw: "2026-11-20", at: null, date: "2026-11-20", precision: "date" },
});

describe("postingOptionLabel", () => {
  it("adds the team and deadline so same-titled postings differ", () => {
    const a = postingOptionLabel(make("a", "에듀윌", "온라인 사이트운영 및 관리", "이러닝팀"));
    const b = postingOptionLabel(make("b", "에듀윌", "온라인 사이트운영 및 관리", "플랫폼팀"));
    assert.notEqual(a, b);
    assert.equal(a, "에듀윌 · 온라인 사이트운영 및 관리 (이러닝팀) · 마감 2026-11-20");
  });

  it("leaves the team out when it repeats the title", () => {
    assert.equal(postingOptionLabel(make("c", "환경부", "생물다양성총괄과", "생물다양성총괄과")), "환경부 · 생물다양성총괄과 · 마감 2026-11-20");
  });
});

describe("searchPostings", () => {
  const list = [make("a", "에듀윌", "콘텐츠 제작", "마케팅팀"), make("b", "풍산", "인사노무", "인사팀")];

  it("returns everything for an empty query", () => {
    assert.equal(searchPostings(list, "  ").length, 2);
  });

  it("matches every word across company, title and team, ignoring case", () => {
    assert.deepEqual(searchPostings(list, "에듀윌 마케팅").map(p => p.id), ["a"]);
    assert.deepEqual(searchPostings(list, "인사팀").map(p => p.id), ["b"]);
    assert.deepEqual(searchPostings(list, "에듀윌 인사").map(p => p.id), []);
  });
});
