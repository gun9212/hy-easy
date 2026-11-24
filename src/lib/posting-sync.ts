// Incremental posting sync. The browser keeps a copy of the posting list; the server sends only postings changed
// since that copy (list copies without the long texts, see posting-body.ts), plus the live fields that change without a content change (applicant counts) and the id list
// that tells the browser which postings are gone.
import type { Posting } from "./domain";
import { toListPosting } from "./posting-body";

/** Changes are re-sent from a little before the browser's copy, so a write racing the last sync is not missed. */
export const SYNC_OVERLAP_MS = 5 * 60_000;

/** [posting id, live applicant count, per-posting lastCheckedAt], in display order (newest first). */
export type LiveRow = [string, number | null, string?];
export type SyncResponse = {
  full: boolean;
  /** False when a reply does not cover the final page yet; cached postings must not be pruned until complete. */
  complete?: boolean;
  postings: Posting[];
  live: LiveRow[];
  syncedAt: string | null;
  lastCheckedAt: string | null;
};

const changedAtOf = (p: Posting): string => p.changedAt ?? p.updatedAt;

function latest(values: string[]): string | null {
  return values.reduce<string | null>((max, v) => (max === null || v > max ? v : max), null);
}

/** Builds the reply for a browser whose copy is as of `since` (null or invalid: send everything). */
export function buildSync(all: Posting[], since: string | null): SyncResponse {
  const sinceMs = since ? Date.parse(since) : NaN;
  const full = Number.isNaN(sinceMs);
  const changed = full ? all : all.filter(p => Date.parse(changedAtOf(p)) > sinceMs - SYNC_OVERLAP_MS);
  // List copies only: the long texts are fetched per posting when a detail or comparison opens.
  const postings = changed.map(toListPosting);
  return {
    full,
    complete: true,
    postings,
    live: all.map(p => [p.id, p.applicants, p.lastCheckedAt]),
    syncedAt: latest(all.map(changedAtOf)),
    lastCheckedAt: latest(all.map(p => p.lastCheckedAt)),
  };
}

/**
 * Applies a sync reply to the browser's copy. Returns null when the copy cannot be repaired from the reply
 * (a posting the browser never had and the reply did not include), so the caller asks for everything instead.
 * When `reply.complete === false`, removals are deferred so cached postings are never deleted before the last page.
 */
export function mergeSync(cached: Posting[], reply: SyncResponse): Posting[] | null {
  const byId = new Map(cached.map(p => [p.id, p]));
  reply.postings.forEach(p => byId.set(p.id, p));
  const merged: Posting[] = [];
  const seen = new Set<string>();
  for (const [id, applicants, lastCheckedAt] of reply.live) {
    const posting = byId.get(id);
    if (!posting) return null;
    const nextCheckedAt = lastCheckedAt ?? posting.lastCheckedAt;
    const updated =
      posting.applicants === applicants && posting.lastCheckedAt === nextCheckedAt
        ? posting
        : { ...posting, applicants, lastCheckedAt: nextCheckedAt };
    merged.push(updated);
    seen.add(id);
  }
  if (reply.complete === false) {
    for (const posting of byId.values()) {
      if (!seen.has(posting.id)) merged.push(posting);
    }
  }
  return merged;
}
