// Drains the classification queue: classifies every pending posting and stores the result.
// The collector also classifies a few per run; use this for the initial backlog or after a prompt change.
// Usage: npm run classify:queue -- [--limit N] [--concurrency N]
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { classify, modelFor, PROMPT_VERSION, TAXONOMY_VERSION, type Provider } from "../src/lib/classifier";
import { recordClassificationCall } from "../src/lib/classification-ledger";
import { classificationInput } from "../src/lib/normalize";
import type { Posting } from "../src/lib/domain";

const MAX_ATTEMPTS = 3;
const DEFAULT_CONCURRENCY = 4;

type Job = { posting_id: string; input_hash: string; attempts: number };
type Outcome = "classified" | "review" | "skipped" | "failed";

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function database(): SupabaseClient {
  const env = z
    .object({ NEXT_PUBLIC_SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) })
    .parse(process.env);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadQueue(db: SupabaseClient, limit: number): Promise<Job[]> {
  const { data, error } = await db
    .from("classification_queue")
    .select("posting_id,input_hash,attempts")
    .lt("attempts", MAX_ATTEMPTS)
    .order("updated_at")
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Job[];
}

async function recordFailure(db: SupabaseClient, job: Job, code: string): Promise<void> {
  await db
    .from("classification_queue")
    .update({ attempts: job.attempts + 1, last_error: code, updated_at: new Date().toISOString() })
    .eq("posting_id", job.posting_id)
    .eq("input_hash", job.input_hash);
}

async function processJob(
  db: SupabaseClient,
  job: Job,
  provider: Provider,
): Promise<{ outcome: Outcome; usd: number }> {
  const { data: row, error } = await db
    .from("postings")
    .select("document,classification_hash")
    .eq("id", job.posting_id)
    .maybeSingle();
  if (error) throw error;
  // The source changed after the job was queued; the newer job will handle it.
  if (!row || row.classification_hash !== job.input_hash) return { outcome: "skipped", usd: 0 };
  try {
    const result = await classify(classificationInput(row.document as Posting), provider);
    const calledAt = new Date().toISOString();
    const saved = await db.from("classifications").upsert({
      posting_id: job.posting_id,
      result: result.classification,
      input_hash: job.input_hash,
      provider,
      model: result.model,
      prompt_version: result.promptVersion,
      taxonomy_version: result.taxonomyVersion,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: result.costUsd,
      created_at: calledAt,
    });
    if (saved.error) throw saved.error;
    await recordClassificationCall(db, {
      postingId: job.posting_id,
      inputHash: job.input_hash,
      provider,
      model: result.model,
      promptVersion: result.promptVersion,
      taxonomyVersion: result.taxonomyVersion,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      status: "succeeded",
      source: "queue_script",
      calledAt,
    });
    await db.from("classification_queue").delete().eq("posting_id", job.posting_id).eq("input_hash", job.input_hash);
    return { outcome: result.classification.needsReview ? "review" : "classified", usd: result.costUsd };
  } catch (e) {
    const code =
      e instanceof Error && /^(MODEL_STOP_|INPUT_REQUIRES_REVIEW)/.test(e.message)
        ? e.message
        : "CLASSIFICATION_FAILED";
    console.error(`  ✗ ${job.posting_id}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    await recordClassificationCall(db, {
      postingId: job.posting_id,
      inputHash: job.input_hash,
      provider,
      model: modelFor(provider),
      promptVersion: PROMPT_VERSION,
      taxonomyVersion: TAXONOMY_VERSION,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      status: "failed",
      source: "queue_script",
    });
    await recordFailure(db, job, code);
    return { outcome: "failed", usd: 0 };
  }
}

async function main(): Promise<void> {
  const provider = z.enum(["claude", "anthropic", "gemini"]).parse(process.env.MODEL_PROVIDER || "anthropic");
  const db = database();
  const jobs = await loadQueue(db, argument("--limit", 1000));
  const concurrency = argument("--concurrency", DEFAULT_CONCURRENCY);
  console.log(`대기열 ${jobs.length}건, 동시 ${concurrency}개, ${provider}`);

  const counts: Record<Outcome, number> = { classified: 0, review: 0, skipped: 0, failed: 0 };
  let usd = 0;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next++];
      const result = await processJob(db, job, provider);
      counts[result.outcome]++;
      usd += result.usd;
      const done = Object.values(counts).reduce((a, b) => a + b, 0);
      if (done % 25 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}  $${usd.toFixed(4)}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  console.log(JSON.stringify({ ...counts, costUsd: Number(usd.toFixed(4)) }));
  if (counts.failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`CLASSIFY_QUEUE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
