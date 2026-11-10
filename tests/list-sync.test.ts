import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listRowHash, type ListRow } from "../worker/hywep-fields";
import { DETAIL_MAX_AGE_MS, planListSync, type KnownPosting } from "../worker/list-sync";

const NOW = Date.parse("2026-11-10T08:00:00Z");
const row = (id: string, overrides: ListRow["fields"] = {}): ListRow => ({
  id,
  url: `https://hywep.hanyang.ac.kr/compjoinmanage/view_stu.do?jid_seq=${id}`,
  fields: {
    company: "가상기업",
    department: "개발팀",
    status: "접수중",
    deadlineDate: "2026-11-20",
    applicants: "3",
    ...overrides,
  },
});
const known = (r: ListRow, checkedAgoMs = 3600_000): KnownPosting => ({
  listHash: listRowHash(r.fields),
  detailCheckedAt: new Date(NOW - checkedAgoMs).toISOString(),
});

describe("목록 기반 상세 재조회 판단", () => {
  it("처음 본 공고는 상세를 읽음", () => {
    const plan = planListSync([row("1")], new Map(), NOW);
    assert.deepEqual(
      plan.detail.map(d => d.reason),
      ["new"],
    );
    assert.equal(plan.touch.length, 0);
  });
  it("목록이 그대로면 상세 없이 지원인원만 갱신", () => {
    const r = row("1");
    const plan = planListSync([{ ...r, fields: { ...r.fields, applicants: "9" } }], new Map([["1", known(r)]]), NOW);
    assert.equal(plan.detail.length, 0);
    assert.deepEqual(plan.touch, [{ source_id: "1", applicants: 9 }]);
  });
  it("마감 연장·상태 변경은 상세를 다시 읽음", () => {
    const r = row("1");
    const map = new Map([["1", known(r)]]);
    assert.equal(planListSync([row("1", { deadlineDate: "2026-11-27" })], map, NOW).detail[0]?.reason, "list_changed");
    assert.equal(planListSync([row("1", { status: "접수마감" })], map, NOW).detail[0]?.reason, "list_changed");
  });
  it("상세를 읽은 지 24시간이 지나면 다시 읽음", () => {
    const r = row("1");
    const plan = planListSync([r], new Map([["1", known(r, DETAIL_MAX_AGE_MS)]]), NOW);
    assert.equal(plan.detail[0]?.reason, "stale");
  });
  it("이전 수집 데이터(list_hash 없음)는 한 번 상세를 읽어 기준값을 만듦", () => {
    const plan = planListSync([row("1")], new Map([["1", { listHash: null, detailCheckedAt: null }]]), NOW);
    assert.equal(plan.detail[0]?.reason, "list_changed");
  });
  it("지원인원이 숫자가 아니면 null로 저장", () => {
    const r = row("1");
    const plan = planListSync([{ ...r, fields: { ...r.fields, applicants: "-" } }], new Map([["1", known(r)]]), NOW);
    assert.deepEqual(plan.touch, [{ source_id: "1", applicants: null }]);
  });
});
