import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { durationOptions, periodMonths, regionOf, regionOptions, stipendOptions } from "../src/lib/filter-options";
import { filterPostings, isNewPosting } from "../src/lib/domain";
import { samplePostings, DEMO_NOW } from "../src/lib/sample";

const now = new Date(DEMO_NOW);

describe("실제 데이터 기반 필터 선택지", () => {
  it("지역 표기 통일: 서울특별시·서울시·서울 → 서울, 경기도 → 경기", () => {
    assert.equal(regionOf("서울특별시 강서구"), "서울");
    assert.equal(regionOf("서울 영등포구"), "서울");
    assert.equal(regionOf("경기도 성남시"), "경기");
    assert.equal(regionOf("서울시 성동구"), "서울");
    assert.equal(regionOf("대전시 유성구"), "대전");
    assert.equal(regionOf("수원시 영통구"), "수원시");
    assert.equal(regionOf("  "), "");
  });
  it("실습기간을 개월 수로 환산", () => {
    assert.equal(periodMonths("2026-12-23 ~ 2027-02-26"), 2);
    assert.equal(periodMonths("2027-01-01~ 2027-02-28"), 2);
    assert.equal(periodMonths("2027-03-02 ~ 2027-06-30"), 4);
    assert.equal(periodMonths("미기재"), null);
    assert.equal(periodMonths("2027-03-01 ~ 2027-01-01"), null);
  });
  it("선택지는 데이터에 있는 값만, 건수 포함", () => {
    const regions = regionOptions(samplePostings).map(([v]) => v);
    assert.ok(regions.includes("서울") && regions.includes("경기"));
    assert.deepEqual(
      durationOptions(samplePostings).map(([v]) => v),
      ["2", "4"],
    );
    assert.ok(stipendOptions(samplePostings).every(([, label]) => /\(\d+\)$/.test(label)));
  });
  it("지역·기간 필터가 환산 값으로 동작", () => {
    const seoul = filterPostings(samplePostings, { location: "서울", closed: "true" }, [], now);
    assert.ok(seoul.length > 0 && seoul.every(p => regionOf(p.location) === "서울"));
    const four = filterPostings(samplePostings, { duration: "4", closed: "true" }, [], now);
    assert.ok(four.length > 0 && four.every(p => periodMonths(p.period) === 4));
  });
});

describe("NEW 배지 (한국 시간 기준)", () => {
  const p = samplePostings[0];
  it("KST 같은 날이면 NEW: UTC로는 전날이어도", () => {
    const kstMorning = new Date("2026-11-10T00:30:00Z"); // 09:30 KST
    assert.equal(isNewPosting({ ...p, firstSeenAt: "2026-11-09T15:10:00Z" }, kstMorning), true); // 00:10 KST same day
  });
  it("KST 전날이면 NEW 아님", () => {
    assert.equal(isNewPosting({ ...p, firstSeenAt: "2026-11-09T14:50:00Z" }, new Date("2026-11-10T00:30:00Z")), false);
  });
});
