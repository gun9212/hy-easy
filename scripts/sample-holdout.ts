// Samples unseen postings from Supabase into a holdout evaluation draft that is disjoint from
// evals/classification-golden.json by both ID and normalized input hash.
//
// Usage:
//   npm run evaluate:sample-holdout -- [--count 30] [--out evals/classification-holdout.draft.json] [--seed hy-holdout-v1]
// Label the drafted `expected` fields by hand from source text (never copy model predictions), then rename to
// evals/classification-holdout.json and run `npm run evaluate -- --set holdout --run --repeat 2`.
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadPostings } from "../src/lib/data";
import { classificationInput } from "../src/lib/normalize";
import { caseInputHash, goldenSetSchema, selectHoldoutCandidates } from "../evals/score";

const TUNING_PATH = "evals/classification-golden.json";
const DEFAULT_OUT = "evals/classification-holdout.draft.json";

const args = process.argv.slice(2);
const numberOption = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  const n = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const stringOption = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

async function main(): Promise<void> {
  const env = z
    .object({ NEXT_PUBLIC_SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) })
    .parse(process.env);
  const count = numberOption("--count", 30);
  const outPath = stringOption("--out", DEFAULT_OUT);
  const seed = stringOption("--seed", "hy-holdout-v1");

  const tuning = goldenSetSchema.parse(JSON.parse(await readFile(TUNING_PATH, "utf8")));
  const excludeIds = new Set(tuning.cases.map(c => c.id));
  const excludeInputHashes = new Set(tuning.cases.map(c => caseInputHash(c.input)));

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const postings = await loadPostings(db);
  const selected = selectHoldoutCandidates(postings, excludeIds, excludeInputHashes, count, seed);

  const draft = {
    version: new Date().toISOString().slice(0, 10),
    split: "holdout",
    note: `프롬프트 조정에 쓰지 않은 홀드아웃 평가용 표본(${selected.length}건, seed=${seed}). expected 필드를 원문 기준으로 직접 기입한 뒤 evals/classification-holdout.json으로 저장하세요.`,
    cases: selected.map(p => ({
      // posting UUID, the same key the tuning set uses, so the ID leakage check can match them.
      id: p.id,
      label: `${p.company} / ${p.title}`,
      input: classificationInput(p),
      expected: {
        primaryRoles: [],
        needsReview: null,
        secondaryAllowed: [],
        majors: {
          requirement: [],
          required: [],
          preferred: [],
          forbidden: [],
        },
      },
    })),
  };

  await writeFile(outPath, `${JSON.stringify(draft, null, 2)}\n`, { mode: 0o600 });
  console.log(`홀드아웃 초안 ${selected.length}건 저장 완료: ${outPath} (조정용 ${tuning.cases.length}건과 중복 0건)`);
}

main().catch((error: unknown) => {
  console.error(`SAMPLE_HOLDOUT_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
