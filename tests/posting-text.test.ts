import assert from "node:assert/strict";
import { test } from "node:test";
import { isSchedule, isShortFact, parseField, parseItem, parsePostingText } from "../src/lib/posting-text";

test("template labels open fields with their same-line value", () => {
  assert.deepEqual(parseField("*직무명 : SW개발"), { label: "직무명", value: "SW개발" });
  assert.deepEqual(parseField("-학점: 학점 무관"), { label: "학점", value: "학점 무관" });
  assert.deepEqual(parseField("*학점/평점 : 3.3 이상"), { label: "학점/평점", value: "3.3 이상" });
  assert.deepEqual(parseField("*운영/지도 :"), { label: "운영/지도", value: "" });
  assert.deepEqual(parseField("-외국인 유학생 지원 여부: 지원불가"), {
    label: "외국인 유학생 지원 여부",
    value: "지원불가",
  });
});

test("a bullet with a colon is not a field unless its label is a template label", () => {
  assert.equal(parseField("- 6개월 근무 가능자 : 겨울방학 + 27-1학기"), null);
  assert.equal(parseField("1주차: 온보딩 및 첫 업로드"), null);
});

test("items recognise bullets, numbers, headings and week rows", () => {
  assert.deepEqual(parseItem("• 주세관련 세무신고 지원"), {
    kind: "bullet",
    marker: null,
    text: "주세관련 세무신고 지원",
  });
  assert.deepEqual(parseItem("- 백엔드 개발자"), { kind: "bullet", marker: null, text: "백엔드 개발자" });
  assert.deepEqual(parseItem("2. 브랜드 제휴 과정을 경험"), {
    kind: "bullet",
    marker: "2.",
    text: "브랜드 제휴 과정을 경험",
  });
  assert.deepEqual(parseItem("① AI 도구를 활용"), { kind: "bullet", marker: "①", text: "AI 도구를 활용" });
  assert.deepEqual(parseItem("3) 성실성"), { kind: "bullet", marker: "3)", text: "성실성" });
  assert.deepEqual(parseItem("[1개월]"), { kind: "heading", text: "1개월" });
  assert.deepEqual(parseItem("<필수>"), { kind: "heading", text: "필수" });
  assert.deepEqual(parseItem("3주차: 주세 관련 매뉴얼 숙지"), {
    kind: "labeled",
    label: "3주차",
    text: "주세 관련 매뉴얼 숙지",
  });
  assert.deepEqual(parseItem("유관 학과 우대"), { kind: "text", text: "유관 학과 우대" });
  assert.deepEqual(parseItem("3.4학년"), { kind: "text", text: "3.4학년" });
  assert.deepEqual(parseItem("*1주-4주차 : 재무제표 분석"), {
    kind: "labeled",
    label: "1주-4주차",
    text: "재무제표 분석",
  });
});

test("a template posting becomes notices, then fields with their items", () => {
  const blocks = parsePostingText(
    "※두학기 연계 실습 : 겨울학기+1학기※\n\n*전공 : 전공무관\n*학년 : 4학년\n*요구 역량 : \n1) 유기화학 지식\n2) 성실성\n\n*유학생 지원 불가",
  );
  assert.deepEqual(blocks, [
    { kind: "notice", text: "두학기 연계 실습 : 겨울학기+1학기" },
    { kind: "field", label: "전공", items: [{ kind: "text", text: "전공무관" }] },
    { kind: "field", label: "학년", items: [{ kind: "text", text: "4학년" }] },
    {
      kind: "field",
      label: "요구 역량",
      items: [
        { kind: "bullet", marker: "1)", text: "유기화학 지식" },
        { kind: "bullet", marker: "2)", text: "성실성" },
        { kind: "bullet", marker: null, text: "유학생 지원 불가" },
      ],
    },
  ]);
});

test("tabs, markdown bold and links are cleaned", () => {
  const [block] = parsePostingText("-\t**필수** 제출 [사이트](https://example.com/jobs)");
  assert.deepEqual(block, {
    kind: "text",
    items: [{ kind: "bullet", marker: null, text: "필수 제출 사이트 (https://example.com/jobs)" }],
  });
});

test("text without the template stays as plain lines", () => {
  assert.deepEqual(parsePostingText("점심 식대 지원 · 실습 지도 담당자 배정"), [
    { kind: "text", items: [{ kind: "text", text: "점심 식대 지원 · 실습 지도 담당자 배정" }] },
  ]);
  assert.deepEqual(parsePostingText(""), []);
});

test("short one-line fields are facts; lists are not", () => {
  const [grade, ability] = parsePostingText("*학년 : 4학년\n*요구 역량 :\n- 성실성");
  assert.equal(isShortFact(grade), true);
  assert.equal(isShortFact(ability), false);
  const [overview] = parsePostingText("*직무개요 : 투자 전 사전 검토 및 투자 후 사후관리 등 VC 전반의 업무 파악");
  assert.equal(isShortFact(overview), false);
});

test("운영/지도 and fields with week rows are schedules; others are not", () => {
  const [plan, tasks, empty] = parsePostingText(
    "*운영/지도 :\n[1개월]\n- 플랫폼 이해\n*직무개요 :\n1주차: 온보딩\n2주차: 실습\n*교육목표 :",
  );
  assert.equal(isSchedule(plan), true);
  assert.equal(isSchedule(tasks), true);
  assert.equal(isSchedule(empty), false);
  const [overview] = parsePostingText("*직무개요 :\n- 리서치\n- 문서 작성");
  assert.equal(isSchedule(overview), false);
});
