// Scores classifier output against a golden or holdout set (evals/classification-golden.json,
// evals/classification-holdout.json). Pure: no model calls.
import { z } from "zod";
import { MAJOR_REQUIREMENTS, ROLES, type Classification, type Posting } from "../src/lib/domain";
import { classificationInput, stableHash } from "../src/lib/normalize";

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
  input: z.object({
    practiceInfo: z.string(),
    qualifications: z.string(),
    tasks: z.string(),
    // Only for postings whose tasks point to an attached file (see worker/attachments.ts).
    attachment: z.string().optional(),
    department: z.string().optional(),
  }),
  expected: z.object({
    primaryRoles: z.array(role).min(1),
    needsReview: z.boolean().nullable(),
    secondaryAllowed: z.array(role),
    majors: z
      .object({
        requirement: z.array(z.enum(MAJOR_REQUIREMENTS)).min(1),
        required: z.array(z.string()),
        preferred: z.array(z.string()),
        /** Optional majors that must not be listed in required/preferred (catches false-positive major extraction). */
        forbidden: z.array(z.string()).optional(),
      })
      .nullable(),
  }),
});
export const goldenSetSchema = z.object({
  version: z.string(),
  split: z.enum(["tuning", "holdout"]).optional(),
  note: z.string(),
  cases: z.array(goldenCaseSchema),
});
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
  majorsForbiddenHit: string[];
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
  majorsForbiddenHits: number;
  passed: boolean;
  scores: CaseScore[];
};

const ratio = (hit: number, total: number): number | null => (total ? hit / total : null);

/**
 * Hash of the posting text both sets share. The attachment and department are left out: older golden cases were saved
 * without them, so including them would let the same posting through as "different" once its attachment was read.
 */
export function caseInputHash(input: Pick<GoldenCase["input"], "practiceInfo" | "qualifications" | "tasks">): string {
  return stableHash({ practiceInfo: input.practiceInfo, qualifications: input.qualifications, tasks: input.tasks });
}

/** Detects any posting shared between the prompt-tuning set and an unseen holdout set, by ID or input text hash. */
export function findHoldoutLeakage(
  tuning: readonly GoldenCase[],
  holdout: readonly GoldenCase[],
): { duplicateIds: string[]; duplicateInputs: string[] } {
  const tuningIds = new Set(tuning.map(c => c.id));
  const tuningHashes = new Set(tuning.map(c => caseInputHash(c.input)));
  const duplicateIds: string[] = [];
  const duplicateInputs: string[] = [];
  for (const item of holdout) {
    if (tuningIds.has(item.id)) duplicateIds.push(item.id);
    if (tuningHashes.has(caseInputHash(item.input))) duplicateInputs.push(item.id);
  }
  return { duplicateIds, duplicateInputs };
}

/**
 * Picks unseen postings for a holdout evaluation draft, excluding all tuning IDs and input hashes,
 * stratified round-robin across primary roles in deterministic hash order.
 */
export function selectHoldoutCandidates(
  postings: readonly Posting[],
  excludeIds: ReadonlySet<string>,
  excludeInputHashes: ReadonlySet<string>,
  count: number,
  seed = "hy-holdout-v1",
): Posting[] {
  const groups = new Map<string, Posting[]>();
  const seenHashes = new Set(excludeInputHashes);
  for (const posting of postings) {
    if (!posting.classification) continue;
    if (excludeIds.has(posting.id) || excludeIds.has(posting.sourceId)) continue;
    const hash = caseInputHash(classificationInput(posting));
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    const bucket = posting.classification.primaryRole;
    const list = groups.get(bucket) ?? [];
    list.push(posting);
    groups.set(bucket, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => stableHash({ seed, id: a.id }).localeCompare(stableHash({ seed, id: b.id })));
  }

  const roleKeys = [...groups.keys()].sort();
  const picked: Posting[] = [];
  let round = 0;
  while (picked.length < count) {
    let added = false;
    for (const key of roleKeys) {
      const candidate = groups.get(key)?.[round];
      if (candidate) {
        picked.push(candidate);
        added = true;
        if (picked.length >= count) break;
      }
    }
    if (!added) break;
    round += 1;
  }
  return picked;
}

export function scoreCase(golden: GoldenCase, prediction: Prediction | undefined): CaseScore {
  const result = prediction?.result ?? null;
  const base = { id: golden.id, label: golden.label, majorsExpected: 0, majorsForbiddenHit: [] as string[] };
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
  const forbidden = majors?.forbidden ?? [];
  return {
    ...base,
    failed: false,
    primaryOk: e.primaryRoles.includes(result.primaryRole),
    reviewOk: e.needsReview === null ? null : e.needsReview === result.needsReview,
    secondaryExtra: result.secondaryRoles.filter(r => !e.secondaryAllowed.includes(r)),
    secondaryCount: result.secondaryRoles.length,
    requirementOk: majors ? majors.requirement.includes(result.majors?.requirement ?? "unknown") : null,
    majorsMissing: mustInclude.filter(m => !listed.includes(m)),
    majorsForbiddenHit: forbidden.filter(m => listed.includes(m)),
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
  const majorsForbiddenHits = scores.reduce((sum, s) => sum + s.majorsForbiddenHit.length, 0);
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
    majorsForbiddenHits,
    passed:
      primaryAccuracy >= PRIMARY_ACCURACY_BAR &&
      (secondaryPrecision ?? 1) >= SECONDARY_PRECISION_BAR &&
      (majorRecall ?? 1) >= MAJOR_RECALL_BAR &&
      majorsForbiddenHits === 0,
    scores,
  };
}
