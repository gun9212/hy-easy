// Re-queues postings classified under an older prompt so a prompt change reaches every posting on its own.
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaleClassification = { postingId: string; promptVersion: string };
export type QueueRow = { posting_id: string; input_hash: string };

/**
 * Picks postings to re-classify after a prompt change. New and changed postings come first, so this only plans work
 * when the queue holds nothing runnable. A posting already in the queue (including one that failed three times) is
 * never re-added, which keeps a posting that cannot be classified from looping forever.
 */
export function planPromptRequeue(input: {
  stale: StaleClassification[];
  currentVersion: string;
  runnableQueued: number;
  queuedIds: ReadonlySet<string>;
  overriddenIds: ReadonlySet<string>;
  hashes: ReadonlyMap<string, string>;
  limit: number;
}): QueueRow[] {
  if (input.runnableQueued > 0 || input.limit <= 0) return [];
  return input.stale
    .filter(s => s.promptVersion !== input.currentVersion)
    .filter(s => !input.queuedIds.has(s.postingId) && !input.overriddenIds.has(s.postingId))
    .flatMap(s => {
      const hash = input.hashes.get(s.postingId);
      return hash ? [{ posting_id: s.postingId, input_hash: hash }] : [];
    })
    .slice(0, input.limit);
}

type Result<T> = { data: T | null; error: unknown };
function rows<T>(result: Result<T[]>): T[] {
  if (result.error) throw result.error;
  return result.data ?? [];
}

/** Loads what planPromptRequeue needs and inserts its rows. Returns how many postings were re-queued. */
export async function requeueStalePrompts(db: SupabaseClient, currentVersion: string, limit: number): Promise<number> {
  const queued = rows<{ posting_id: string; attempts: number }>(
    await db.from("classification_queue").select("posting_id,attempts"),
  );
  const runnableQueued = queued.filter(q => q.attempts < 3).length;
  if (runnableQueued > 0) return 0;
  const stale = rows<{ posting_id: string; prompt_version: string }>(
    await db.from("classifications").select("posting_id,prompt_version").neq("prompt_version", currentVersion),
  );
  if (!stale.length) return 0;
  // Both tables hold a few hundred rows, so they are read whole instead of filtering by a long id list.
  const [overrides, postings] = await Promise.all([
    db.from("classification_overrides").select("posting_id"),
    db.from("postings").select("id,classification_hash"),
  ]);
  const plan = planPromptRequeue({
    stale: stale.map(s => ({ postingId: s.posting_id, promptVersion: s.prompt_version })),
    currentVersion,
    runnableQueued,
    queuedIds: new Set(queued.map(q => q.posting_id)),
    overriddenIds: new Set(rows<{ posting_id: string }>(overrides).map(o => o.posting_id)),
    hashes: new Map(
      rows<{ id: string; classification_hash: string | null }>(postings).flatMap(p =>
        p.classification_hash ? [[p.id, p.classification_hash] as const] : [],
      ),
    ),
    limit,
  });
  if (!plan.length) return 0;
  const inserted = await db
    .from("classification_queue")
    .upsert(plan, { onConflict: "posting_id", ignoreDuplicates: true });
  if (inserted.error) throw inserted.error;
  return plan.length;
}
