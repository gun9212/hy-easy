import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider } from "./classifier";

export type ClassificationCallSource = "collector" | "queue_script";
export type ClassificationCallStatus = "succeeded" | "failed";

export type ClassificationCallEntry = {
  postingId: string;
  inputHash: string;
  provider: Provider;
  model: string;
  promptVersion: string;
  taxonomyVersion: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  status: ClassificationCallStatus;
  source: ClassificationCallSource;
  calledAt?: string;
};

export type MonthlyAiCost = {
  month: string;
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export function buildCallRow(entry: ClassificationCallEntry) {
  return {
    posting_id: entry.postingId,
    input_hash: entry.inputHash,
    provider: entry.provider,
    model: entry.model,
    prompt_version: entry.promptVersion,
    taxonomy_version: entry.taxonomyVersion,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    cost_usd: entry.costUsd,
    status: entry.status,
    source: entry.source,
    called_at: entry.calledAt ?? new Date().toISOString(),
  };
}

/** Appends one call to public.classification_calls so overwritten re-classifications stay in monthly totals. */
export async function recordClassificationCall(db: SupabaseClient, entry: ClassificationCallEntry): Promise<void> {
  const { error } = await db.from("classification_calls").insert(buildCallRow(entry));
  if (error) {
    console.error(
      JSON.stringify({
        severity: "ERROR",
        event: "classification_call_log_failed",
        postingId: entry.postingId,
        status: entry.status,
        message: error.message.slice(0, 200),
      }),
    );
  }
}

type RawMonthlyRow = {
  month: string;
  calls: number | string;
  failed_calls: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  cost_usd: number | string;
};

export function normalizeMonthlyAiCost(rows: readonly RawMonthlyRow[] | null | undefined): MonthlyAiCost[] {
  return (rows ?? []).map(row => ({
    month: row.month,
    calls: Number(row.calls) || 0,
    failedCalls: Number(row.failed_calls) || 0,
    inputTokens: Number(row.input_tokens) || 0,
    outputTokens: Number(row.output_tokens) || 0,
    costUsd: Number(row.cost_usd) || 0,
  }));
}
