import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  combineDeadline,
  parseCount,
  parseSelectionInfo,
  parseStipend,
  sourceHash,
  splitInstitution,
} from "../src/lib/normalize";
import { samplePostings } from "../src/lib/sample";

describe("HY-WEP 실측 형식", () => {
  it("목록 지원금 '월/1,620,000' (원 없음)", () => {
    assert.deepEqual(parseStipend("월/1,620,000"), { raw: "월/1,620,000", amount: 1_620_000, unit: "month" });
  });
  it("상세 지원금 '월 1,620,000 원'", () => assert.equal(parseStipend("월 1,620,000 원").amount, 1_620_000));
  it("숫자가 여러 개면 확정 금액으로 보지 않음", () => assert.equal(parseStipend("월 100만원, 식대 10").amount, null));
  it("0원은 확정 금액이 아님", () => assert.equal(parseStipend("월/0").amount, null));
  it("날짜·시간 컬럼 결합 '24시까지'", () => {
    const deadline = combineDeadline("2026-10-26", "24시까지");
    assert.equal(deadline.at, "2026-10-26T15:00:00.000Z");
    assert.equal(deadline.precision, "minute");
  });
  it("시간 컬럼이 비면 날짜 정밀도", () => assert.equal(combineDeadline("2026-10-26", "").precision, "date"));
  it("선발정보 문자열 분해", () => {
    const info = parseSelectionInfo("2 명 / 학년무관 / 접수마감 : 2026-10-26 / 시간 : 24시까지");
    assert.equal(info.headcount, 2);
    assert.equal(info.grade, "학년무관");
    assert.equal(info.deadline.at, "2026-10-26T15:00:00.000Z");
  });
  it("선발정보에 마감이 없으면 미확인", () =>
    assert.equal(parseSelectionInfo("2 명 / 학년무관").deadline.precision, "unknown"));
  it("인원 수", () => {
    assert.equal(parseCount("2"), 2);
    assert.equal(parseCount("12 명"), 12);
    assert.equal(parseCount("-"), null);
  });
  it("기관명 / 부서명 분리, 배지 제거, 띄어쓰기 없는 '/'는 기관명 일부", () => {
    assert.deepEqual(splitInstitution("가상테크(주) / 개발팀 신규모집"), {
      company: "가상테크(주)",
      department: "개발팀",
    });
    assert.deepEqual(splitInstitution("가상A/가상B센터 / 기획팀"), {
      company: "가상A/가상B센터",
      department: "기획팀",
    });
    assert.deepEqual(splitInstitution("가상테크(주)"), { company: "가상테크(주)", department: "" });
  });
  it("지원인원 변동은 변경 이력 해시에 영향 없음", () => {
    const p = samplePostings[0];
    assert.equal(sourceHash(p), sourceHash({ ...p, applicants: 99 }));
  });
});
