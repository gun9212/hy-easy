import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  caseInputHash,
  findHoldoutLeakage,
  goldenSetSchema,
  scoreCase,
  selectHoldoutCandidates,
  summarize,
  type GoldenCase,
} from "../evals/score";
import type { Classification, Posting } from "../src/lib/domain";
import { samplePostings } from "../src/lib/sample";

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

// The golden set is local-only (gitignored: HY-WEP postings are login-only), so CI skips this check.
const GOLDEN_PATH = "evals/classification-golden.json";
test("the local golden set parses and has unique ids", { skip: !existsSync(GOLDEN_PATH) }, () => {
  const set = goldenSetSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")));
  assert.equal(set.cases.length, 34);
  assert.equal(new Set(set.cases.map(c => c.id)).size, 34);
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

test("flags forbidden majors as false-positive major extraction errors", () => {
  const strictCase: GoldenCase = {
    ...golden,
    expected: {
      ...golden.expected,
      majors: { ...golden.expected.majors!, forbidden: ["경영학부"] },
    },
  };
  const leaked = summarize(
    [strictCase],
    [
      {
        id: "a",
        result: result({
          majors: {
            requirement: "listed",
            required: ["기계공학부", "전기공학전공", "경영학부"],
            preferred: [],
            related: [],
          },
        }),
      },
    ],
  );
  assert.deepEqual(leaked.scores[0].majorsForbiddenHit, ["경영학부"]);
  assert.equal(leaked.majorsForbiddenHits, 1);
  assert.equal(leaked.passed, false);
});

test("findHoldoutLeakage detects both duplicate IDs and copied input texts", () => {
  const sameId: GoldenCase = { ...golden, input: { practiceInfo: "", qualifications: "", tasks: "다른 업무" } };
  const copiedText: GoldenCase = { ...golden, id: "brand-new-id" };
  const unseen: GoldenCase = {
    ...golden,
    id: "unseen-1",
    input: { practiceInfo: "새 실습", qualifications: "새 자격", tasks: "새 업무" },
  };
  assert.deepEqual(findHoldoutLeakage([golden], [sameId, copiedText, unseen]), {
    duplicateIds: ["a"],
    duplicateInputs: ["brand-new-id"],
  });
  assert.deepEqual(findHoldoutLeakage([golden], [unseen]), { duplicateIds: [], duplicateInputs: [] });
});

test("findHoldoutLeakage still matches a tuning posting whose attachment was read after it was labeled", () => {
  // Older tuning cases were saved without attachment/department; the same posting later gains them.
  const withAttachment: GoldenCase = {
    ...golden,
    id: "re-collected",
    input: { ...golden.input, attachment: "첨부 본문", department: "개발팀" },
  };
  assert.deepEqual(findHoldoutLeakage([golden], [withAttachment]).duplicateInputs, ["re-collected"]);
});

test("selectHoldoutCandidates excludes tuning IDs/input hashes and stratifies across primary roles", () => {
  const pool: Posting[] = samplePostings.slice(0, 4);
  const excluded = pool[0];
  const excludedIds = new Set([excluded.sourceId]);
  const excludedHashes = new Set([
    caseInputHash({
      practiceInfo: pool[1].practiceInfo,
      qualifications: pool[1].qualifications,
      tasks: pool[1].tasks,
    }),
  ]);
  const picked = selectHoldoutCandidates(pool, excludedIds, excludedHashes, 4, "test-seed");
  assert.equal(picked.length, 2);
  assert.equal(
    picked.some(p => p.id === excluded.id || p.id === pool[1].id),
    false,
  );
  // Deterministic given the same seed.
  assert.deepEqual(
    picked.map(p => p.id),
    selectHoldoutCandidates(pool, excludedIds, excludedHashes, 4, "test-seed").map(p => p.id),
  );
});
