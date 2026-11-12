import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { goldenSetSchema, scoreCase, summarize, type GoldenCase } from "../evals/score";
import type { Classification } from "../src/lib/domain";

const golden: GoldenCase = {
  id: "a",
  label: "회사 / 공고",
  input: { practiceInfo: "", qualifications: "", tasks: "업무" },
  expected: {
    primaryRoles: ["연구개발", "데이터·AI"],
    needsReview: false,
    secondaryAllowed: ["개발"],
    majors: { requirement: ["listed"], required: ["기계공학부", "전기공학전공"], preferred: [] },
  },
};

const result = (patch: Partial<Classification> = {}): Classification => ({
  primaryRole: "연구개발",
  secondaryRoles: [],
  summary: "요약",
  evidence: [{ field: "tasks", quote: "업무" }],
  needsReview: false,
  majors: { requirement: "listed", required: ["기계공학부", "전기공학전공"], preferred: [], related: [] },
  ...patch,
});

test("the committed golden set parses and has unique ids", () => {
  const set = goldenSetSchema.parse(JSON.parse(readFileSync("evals/classification-golden.json", "utf8")));
  assert.equal(set.cases.length, 30);
  assert.equal(new Set(set.cases.map(c => c.id)).size, 30);
});

test("accepts any listed primary role and flags secondary roles outside the allowed set", () => {
  const s = scoreCase(golden, {
    id: "a",
    result: result({ primaryRole: "데이터·AI", secondaryRoles: ["개발", "마케팅"] }),
  });
  assert.equal(s.primaryOk, true);
  assert.deepEqual(s.secondaryExtra, ["마케팅"]);
  assert.equal(s.secondaryCount, 2);
});

test("counts missing must-include majors and a wrong requirement", () => {
  const s = scoreCase(golden, {
    id: "a",
    result: result({ majors: { requirement: "any", required: [], preferred: ["기계공학부"], related: [] } }),
  });
  assert.equal(s.requirementOk, false);
  assert.deepEqual(s.majorsMissing, ["전기공학전공"]);
});

test("a failed or missing prediction is a wrong primary role", () => {
  assert.equal(scoreCase(golden, { id: "a", result: null }).failed, true);
  assert.equal(scoreCase(golden, undefined).primaryOk, false);
});

test("summary applies the release bars", () => {
  const good = summarize([golden], [{ id: "a", result: result({ secondaryRoles: ["개발"] }) }]);
  assert.equal(good.passed, true);
  assert.equal(good.secondaryPrecision, 1);
  assert.equal(good.majorRecall, 1);
  const bad = summarize([golden], [{ id: "a", result: result({ primaryRole: "마케팅" }) }]);
  assert.equal(bad.primaryAccuracy, 0);
  assert.equal(bad.passed, false);
});
