// Read-only preview: classifies a few open postings and prints the result. Writes nothing to the database.
// Usage: npm run classify:preview -- [count]
//        npm run classify:preview -- --titles "회사 / 제목;회사2 / 제목2"   (fixed set, for before/after comparisons)
import { createClient } from "@supabase/supabase-js";
import { classify, type Provider } from "../src/lib/classifier";
import { classificationInput } from "../src/lib/normalize";
import type { Posting } from "../src/lib/domain";

const DEFAULT_COUNT = 8;
const POOL_SIZE = 40;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function database() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Loads postings whose "company / title" exactly matches one of the given labels, in the given order. */
async function loadByTitles(labels: string[]): Promise<Posting[]> {
  const { data, error } = await database().from("postings").select("document");
  if (error) throw error;
  const byLabel = new Map<string, Posting>(
    (data ?? []).map(row => {
      const p = row.document as Posting;
      return [`${p.company} / ${p.title}`, p];
    }),
  );
  return labels.map(label => byLabel.get(label)).filter((p): p is Posting => Boolean(p));
}

async function loadSample(count: number): Promise<Posting[]> {
  const { data, error } = await database()
    .from("postings")
    .select("document")
    .eq("document->>recruitment", "open")
    .order("first_seen_at")
    .order("source_id")
    .limit(POOL_SIZE);
  if (error) throw error;
  const pool = (data ?? []).map(row => row.document as Posting);
  const step = Math.max(1, Math.floor(pool.length / count));
  return pool.filter((_, i) => i % step === 0).slice(0, count);
}

async function main(): Promise<void> {
  const titlesFlag = process.argv.indexOf("--titles");
  const labels =
    titlesFlag >= 0
      ? (process.argv[titlesFlag + 1] ?? "")
          .split(";")
          .map(s => s.trim())
          .filter(Boolean)
      : [];
  const postings = labels.length
    ? await loadByTitles(labels)
    : await loadSample(Number(process.argv[2]) || DEFAULT_COUNT);
  if (labels.length && postings.length !== labels.length) console.log(`(일치 ${postings.length}/${labels.length}건)`);
  const provider = (process.env.MODEL_PROVIDER || "anthropic") as Provider;
  let totalUsd = 0;
  for (const posting of postings) {
    console.log(`\n■ ${posting.company} / ${posting.title}`);
    try {
      const result = await classify(classificationInput(posting), provider);
      const c = result.classification;
      totalUsd += result.costUsd;
      const secondary = c.secondaryRoles.length ? ` (+${c.secondaryRoles.join(", ")})` : "";
      console.log(`  → ${c.primaryRole}${secondary}${c.needsReview ? "  [검토 필요]" : ""}`);
      console.log(`  ${c.summary}`);
    } catch (error) {
      console.log(`  ✗ ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
    }
  }
  console.log(`\n합계 비용 약 $${totalUsd.toFixed(4)} (${provider})`);
}

main().catch((error: unknown) => {
  console.error(`PREVIEW_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
