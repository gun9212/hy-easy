// Scores classifier output against the golden set (evals/classification-golden.json). Pure: no model calls.
import { z } from "zod";
import { MAJOR_REQUIREMENTS, ROLES, type Classification } from "../src/lib/domain";

/** Release bar from docs/classification-check.md. */
export const PRIMARY_ACCURACY_BAR = 0.85;
/** Below this, secondary roles are inflating the role filter again. */
export const SECONDARY_PRECISION_BAR = 0.75;
/** Share of the must-include majors that the model must list. */
export const MAJOR_RECALL_BAR = 0.8;

const role = z.enum(ROLES);
export const goldenCaseSchema = z.object({
  id: z.string(),
  label: z.string(),
  input: z.object({ practiceInfo: z.string(), qualifications: z.string(), tasks: z.string() }),
  expected: z.object({
    primaryRoles: z.array(role).min(1),
    needsReview: z.boolean().nullable(),
    secondaryAllowed: z.array(role),
    majors: z
      .object({
        requirement: z.array(z.enum(MAJOR_REQUIREMENTS)).min(1),
        required: z.array(z.string()),
        preferred: z.array(z.string()),
      })
      .nullable(),
  }),
});
export const goldenSetSchema = z.object({ version: z.string(), note: z.string(), cases: z.array(goldenCaseSchema) });
export type GoldenCase = z.infer<typeof goldenCaseSchema>;

/** One model answer per case; null when the classifier failed (refusal, invalid evidence, API error). */
export type Prediction = { id: string; result: Classification | null; error?: string };

export type CaseScore = {
  id: string;
  label: string;
  failed: boolean;
  primaryOk: boolean | null;
  reviewOk: boolean | null;
  secondaryExtra: string[];
  secondaryCount: number;
  requirementOk: boolean | null;
  majorsMissing: string[];
  majorsExpected: number;
};

export type Summary = {
  cases: number;
  failed: number;
  primaryAccuracy: number;
  reviewAgreement: number | null;
  secondaryPrecision: number | null;
  requirementAccuracy: number | null;
  majorRecall: number | null;
  passed: boolean;
  scores: CaseScore[];
};

const ratio = (hit: number, total: number): number | null => (total ? hit / total : null);

export function scoreCase(golden: GoldenCase, prediction: Prediction | undefined): CaseScore {
  const result = prediction?.result ?? null;
  const base = { id: golden.id, label: golden.label, majorsExpected: 0 };
  if (!result) {
    return {
      ...base,
      failed: true,
      primaryOk: false,
      reviewOk: null,
      secondaryExtra: [],
      secondaryCount: 0,
      requirementOk: null,
      majorsMissing: [],
    };
  }
  const e = golden.expected;
  const majors = e.majors;
  const listed = majors ? [...(result.majors?.required ?? []), ...(result.majors?.preferred ?? [])] : [];
  const mustInclude = majors ? [...majors.required, ...majors.preferred] : [];
  return {
    ...base,
    failed: false,
    primaryOk: e.primaryRoles.includes(result.primaryRole),
    reviewOk: e.needsReview === null ? null : e.needsReview === result.needsReview,
    secondaryExtra: result.secondaryRoles.filter(r => !e.secondaryAllowed.includes(r)),
    secondaryCount: result.secondaryRoles.length,
    requirementOk: majors ? majors.requirement.includes(result.majors?.requirement ?? "unknown") : null,
    majorsMissing: mustInclude.filter(m => !listed.includes(m)),
    majorsExpected: mustInclude.length,
  };
}

export function summarize(golden: GoldenCase[], predictions: Prediction[]): Summary {
  const byId = new Map(predictions.map(p => [p.id, p]));
  const scores = golden.map(g => scoreCase(g, byId.get(g.id)));
  const reviewed = scores.filter(s => s.reviewOk !== null);
  const requirement = scores.filter(s => s.requirementOk !== null);
  const secondaryCount = scores.reduce((sum, s) => sum + s.secondaryCount, 0);
  const secondaryExtra = scores.reduce((sum, s) => sum + s.secondaryExtra.length, 0);
  const majorsExpected = scores.reduce((sum, s) => sum + s.majorsExpected, 0);
  const majorsMissing = scores.reduce((sum, s) => sum + s.majorsMissing.length, 0);
  const primaryAccuracy = scores.filter(s => s.primaryOk).length / (scores.length || 1);
  const secondaryPrecision = ratio(secondaryCount - secondaryExtra, secondaryCount);
  const majorRecall = ratio(majorsExpected - majorsMissing, majorsExpected);
  return {
    cases: scores.length,
    failed: scores.filter(s => s.failed).length,
    primaryAccuracy,
    reviewAgreement: ratio(reviewed.filter(s => s.reviewOk).length, reviewed.length),
    secondaryPrecision,
    requirementAccuracy: ratio(requirement.filter(s => s.requirementOk).length, requirement.length),
    majorRecall,
    passed:
      primaryAccuracy >= PRIMARY_ACCURACY_BAR &&
      (secondaryPrecision ?? 1) >= SECONDARY_PRECISION_BAR &&
      (majorRecall ?? 1) >= MAJOR_RECALL_BAR,
    scores,
  };
}
