// Read-only preview: classifies a few open postings and prints the result. Writes nothing to the database.
// Usage: npm run classify:preview -- [count]
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

async function loadSample(count: number): Promise<Posting[]> {
  const db = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db
    .from("postings")
    .select("document")
    .eq("document->>recruitment", "open")
    .order("first_seen_at")
    .limit(POOL_SIZE);
  if (error) throw error;
  const pool = (data ?? []).map(row => row.document as Posting);
  const step = Math.max(1, Math.floor(pool.length / count));
  return pool.filter((_, i) => i % step === 0).slice(0, count);
}

async function main(): Promise<void> {
  const count = Number(process.argv[2]) || DEFAULT_COUNT;
  const provider = (process.env.MODEL_PROVIDER || "anthropic") as Provider;
  let totalUsd = 0;
  for (const posting of await loadSample(count)) {
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
