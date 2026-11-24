// Classification eval: runs the current prompt over the tuning or unseen holdout set (evals/score.ts).
// Usage: npm run evaluate                                  (checks the tuning golden file only, no model calls)
//        npm run evaluate -- --set holdout                 (checks holdout file + verifies zero leakage vs tuning)
//        npm run evaluate -- --set holdout --run --repeat 2 (paid: scores unseen holdout postings)
//        npm run evaluate -- --file path/to/set.json --run
// Exits 1 when leakage is found or the run is below the bars in evals/score.ts.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { classify, PROMPT_VERSION, type Provider } from "../src/lib/classifier";
import {
  findHoldoutLeakage,
  goldenSetSchema,
  MAJOR_RECALL_BAR,
  PRIMARY_ACCURACY_BAR,
  SECONDARY_PRECISION_BAR,
  summarize,
  type GoldenCase,
  type Prediction,
  type Summary,
} from "../evals/score";

const TUNING_PATH = "evals/classification-golden.json";
const HOLDOUT_PATH = "evals/classification-holdout.json";
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  const n = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const stringOption = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

async function predictAll(
  cases: GoldenCase[],
  provider: Provider,
): Promise<{ predictions: Prediction[]; cost: number }> {
  const predictions: Prediction[] = [];
  let cost = 0;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < cases.length) {
      const c = cases[next++];
      try {
        const r = await classify(c.input, provider);
        cost += r.costUsd;
        predictions.push({ id: c.id, result: r.classification });
      } catch (e) {
        predictions.push({ id: c.id, result: null, error: e instanceof Error ? e.message.slice(0, 120) : String(e) });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { predictions, cost };
}

const pct = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(0)}%`);

function print(summary: Summary, run: number, split: string, predictions: Prediction[]): void {
  console.log(`\n[실행 ${run} · ${split}] 프롬프트 ${PROMPT_VERSION}`);
  console.log(`  주 직군 정확도   ${pct(summary.primaryAccuracy)} (기준 ${pct(PRIMARY_ACCURACY_BAR)})`);
  console.log(`  보조 직군 정밀도 ${pct(summary.secondaryPrecision)} (기준 ${pct(SECONDARY_PRECISION_BAR)})`);
  console.log(`  지원 학과 포함률 ${pct(summary.majorRecall)} (기준 ${pct(MAJOR_RECALL_BAR)})`);
  console.log(`  전공 조건 일치   ${pct(summary.requirementAccuracy)}`);
  console.log(`  검토 필요 일치   ${pct(summary.reviewAgreement)}`);
  if (summary.majorsForbiddenHits > 0) console.log(`  금지 학과 오포함 ${summary.majorsForbiddenHits}건`);
  console.log(`  분류 실패        ${summary.failed}건`);
  const byId = new Map(predictions.map(p => [p.id, p]));
  for (const s of summary.scores) {
    const problems = [
      s.failed ? `실패: ${byId.get(s.id)?.error ?? ""}` : "",
      s.primaryOk === false && !s.failed ? `주 직군 ${byId.get(s.id)?.result?.primaryRole}` : "",
      s.secondaryExtra.length ? `보조 +${s.secondaryExtra.join(",")}` : "",
      s.requirementOk === false ? `전공 조건 ${byId.get(s.id)?.result?.majors?.requirement}` : "",
      s.majorsMissing.length ? `학과 누락 ${s.majorsMissing.join(",")}` : "",
      s.majorsForbiddenHit.length ? `금지 학과 포함 ${s.majorsForbiddenHit.join(",")}` : "",
      s.reviewOk === false ? "검토 표시 불일치" : "",
    ].filter(Boolean);
    if (problems.length) console.log(`  - ${s.label.slice(0, 40)}: ${problems.join(" / ")}`);
  }
}

async function main(): Promise<void> {
  const setArg = stringOption("--set");
  const fileArg = stringOption("--file");
  const datasetPath = fileArg ?? (setArg === "holdout" ? HOLDOUT_PATH : TUNING_PATH);
  const golden = goldenSetSchema.parse(JSON.parse(await readFile(datasetPath, "utf8")));
  const split = golden.split ?? (datasetPath === HOLDOUT_PATH || setArg === "holdout" ? "holdout" : "tuning");

  if (new Set(golden.cases.map(c => c.id)).size !== golden.cases.length) {
    throw new Error("정답표에 중복 공고가 있습니다.");
  }

  // Holdout sets must never overlap with the prompt-tuning golden set by ID or normalized input text.
  if (split === "holdout" && datasetPath !== TUNING_PATH) {
    const tuning = goldenSetSchema.parse(JSON.parse(await readFile(TUNING_PATH, "utf8")));
    const leakage = findHoldoutLeakage(tuning.cases, golden.cases);
    if (leakage.duplicateIds.length || leakage.duplicateInputs.length) {
      throw new Error(
        `홀드아웃 정답표에 조정용 정답표(${TUNING_PATH})와 겹치는 공고가 있습니다. ` +
          `중복 ID: [${leakage.duplicateIds.join(", ")}], 중복 원문: [${leakage.duplicateInputs.join(", ")}]`,
      );
    }
  }

  if (!flag("--run")) {
    console.log(
      `${split} 정답표(${datasetPath}) ${golden.cases.length}건 형식${split === "holdout" ? "·비중복" : ""} 확인 완료. 모델을 호출하려면 --run을 붙이세요(유료).`,
    );
    return;
  }

  const provider = (process.env.MODEL_PROVIDER || "anthropic") as Provider;
  const repeat = option("--repeat", 1);
  const runs: { summary: Summary; predictions: Prediction[] }[] = [];
  let cost = 0;
  for (let run = 1; run <= repeat; run++) {
    const { predictions, cost: c } = await predictAll(golden.cases, provider);
    cost += c;
    const summary = summarize(golden.cases, predictions);
    runs.push({ summary, predictions });
    print(summary, run, split, predictions);
  }
  await mkdir("output/evaluations", { recursive: true });
  const reportPath = `output/evaluations/${split}-${PROMPT_VERSION}-${Date.now()}.json`;
  await writeFile(
    reportPath,
    JSON.stringify({ split, dataset: datasetPath, promptVersion: PROMPT_VERSION, provider, cost, runs }, null, 2),
    { mode: 0o600 },
  );
  const passed = runs.every(r => r.summary.passed);
  console.log(`\n[${split}] ${passed ? "통과" : "기준 미달"} · 비용 약 $${cost.toFixed(4)} · 보고서 ${reportPath}`);
  if (!passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`EVALUATE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
