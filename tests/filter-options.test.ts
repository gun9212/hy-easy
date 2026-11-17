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

describe("신규 공고: 최근 3영업일 (한국 시간 기준)", () => {
  const p = samplePostings[0];
  const seen = (firstSeenAt: string, now: Date) => isNewPosting({ ...p, firstSeenAt }, now);
  const monday = new Date("2026-11-16T00:30:00Z"); // 월 09:30 KST → 월·금·목

  it("월요일에는 지난 목·금 공고도 신규", () => {
    assert.equal(seen("2026-11-12T01:00:00Z", monday), true); // 목 10:00
    assert.equal(seen("2026-11-13T08:50:00Z", monday), true); // 금 17:50
    assert.equal(seen("2026-11-16T00:10:00Z", monday), true); // 월 09:10
  });
  it("3영업일 전(수요일)은 신규 아님", () => {
    assert.equal(seen("2026-11-11T08:00:00Z", monday), false); // 수 17:00
  });
  it("주말에 처음 발견된 공고는 신규", () => {
    assert.equal(seen("2026-11-14T03:00:00Z", monday), true); // 토 12:00
  });
  it("경계는 KST 자정: UTC로는 전날이어도", () => {
    assert.equal(seen("2026-11-11T15:10:00Z", monday), true); // 목 00:10 KST
    assert.equal(seen("2026-11-11T14:50:00Z", monday), false); // 수 23:50 KST
  });
  it("주말에 보면 지난 3영업일(수·목·금)", () => {
    const sunday = new Date("2026-11-15T03:00:00Z"); // 일 12:00 KST
    assert.equal(seen("2026-11-11T01:00:00Z", sunday), true); // 수
    assert.equal(seen("2026-11-10T08:00:00Z", sunday), false); // 화
  });
});
