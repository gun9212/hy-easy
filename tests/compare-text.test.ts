import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareSections, OTHER_LABEL } from "../src/lib/compare-text";

const templated = [
  "*직무명:AX 엔지니어",
  "*교육목표 :",
  "Production 환경의 자동화 시스템 이해",
  "- Git 협업, 코드 리뷰",
  "*직무개요 :",
  "사내 시스템을 플랫폼으로 끌어올리는 포지션",
].join("\n");
const otherOrder = ["*직무명 : 백엔드", "*직무 개요 : 외부 시스템 연동", "*운영 / 지도 :", "1주차: 온보딩"].join("\n");
const freeForm = "데이터 분석 보조 업무를 합니다.\n주간 리포트 작성";

describe("compareSections", () => {
  it("puts the same template section of each posting in one row, in reading order", () => {
    const rows = compareSections([templated, otherOrder]);
    assert.deepEqual(
      rows.map(r => r.label),
      ["직무개요", "교육목표", "운영/지도"],
    );
    assert.deepEqual(rows[0].cells, ["사내 시스템을 플랫폼으로 끌어올리는 포지션", "외부 시스템 연동"]);
    assert.deepEqual(rows[1].cells, ["Production 환경의 자동화 시스템 이해\n• Git 협업, 코드 리뷰", ""]);
    assert.deepEqual(rows[2].cells, ["", "1주차: 온보딩"]);
  });

  it("drops the job title row, which the header already shows", () => {
    assert.ok(!compareSections([templated]).some(r => r.label === "직무명"));
  });

  it("keeps free-form text in a last catch-all row", () => {
    const rows = compareSections([templated, freeForm]);
    const other = rows.at(-1)!;
    assert.equal(other.label, OTHER_LABEL);
    assert.deepEqual(other.cells, ["", "데이터 분석 보조 업무를 합니다.\n주간 리포트 작성"]);
  });

  it("merges spellings of one section and keeps a readable label", () => {
    const rows = compareSections([
      "-학점: 무관\n-외국인 유학생 지원 여부: 가능",
      "*학점/평점 : 3.0 이상\n*유학생 지원 : 불가",
    ]);
    assert.deepEqual(rows, [
      { label: "학점", cells: ["무관", "3.0 이상"] },
      { label: "유학생 지원", cells: ["가능", "불가"] },
    ]);
  });

  it("drops quotes wrapped around a pasted block", () => {
    const [row] = compareSections(['*운영/지도 :\n"1주차: 온보딩\n2주차: 실습"']);
    assert.equal(row.cells[0], "1주차: 온보딩\n2주차: 실습");
  });

  it("calls the only row 원문 when no posting follows the template", () => {
    assert.deepEqual(
      compareSections([freeForm, "다른 업무"]).map(r => r.label),
      ["원문"],
    );
  });

  it("returns no rows for empty texts", () => {
    assert.deepEqual(compareSections(["", ""]), []);
  });
});
