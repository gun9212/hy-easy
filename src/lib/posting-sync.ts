// Incremental posting sync. The browser keeps a copy of the posting list; the server sends only postings changed
// since that copy, plus the live fields that change without a content change (applicant counts) and the id list
// that tells the browser which postings are gone.
import type { Posting } from "./domain";

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
  const postings = full ? all : all.filter(p => Date.parse(changedAtOf(p)) > sinceMs - SYNC_OVERLAP_MS);
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

export class SyncHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isAuthDeniedError(error: unknown): boolean {
  return error instanceof SyncHttpError && (error.status === 401 || error.status === 403);
}

export type StoredPostingSnapshot = { syncedAt: string; lastCheckedAt: string | null; postings: Posting[] };

export type BrowserSyncDeps = {
  readStored: () => Promise<StoredPostingSnapshot | null>;
  writeStored: (value: StoredPostingSnapshot) => Promise<void>;
  clearStored: () => Promise<void>;
  fetchSync: (since: string | null) => Promise<SyncResponse>;
};

export type BrowserSyncOutcome =
  | { ok: true; postings: Posting[]; lastCheckedAt: string | null }
  | { ok: false; authDenied: boolean; error: string };

export type PostingsViewState = {
  postings: Posting[];
  ready: boolean;
  lastCheckedAt: string | null;
  error: string;
};

/** Applies a sync outcome to the screen state, wiping displayed postings when school access is denied (401/403). */
export function applyPostingSyncOutcome(prev: PostingsViewState, outcome: BrowserSyncOutcome): PostingsViewState {
  if (outcome.ok) {
    return { postings: outcome.postings, ready: true, lastCheckedAt: outcome.lastCheckedAt, error: "" };
  }
  if (outcome.authDenied) {
    return { postings: [], ready: true, lastCheckedAt: null, error: outcome.error };
  }
  return { ...prev, ready: true, error: outcome.error };
}

/**
 * Verifies school eligibility via the sync endpoint before returning any cached postings.
 * When the server denies access (401 or 403), clears IndexedDB so stale postings never remain in the browser.
 */
export async function syncBrowserPostings(deps: BrowserSyncDeps): Promise<BrowserSyncOutcome> {
  const stored = await deps.readStored();
  try {
    let reply = await deps.fetchSync(stored?.syncedAt ?? null);
    let postings = reply.full ? reply.postings : mergeSync(stored?.postings ?? [], reply);
    if (!postings) {
      reply = await deps.fetchSync(null);
      postings = reply.postings;
    }
    if (reply.syncedAt) {
      await deps.writeStored({ syncedAt: reply.syncedAt, lastCheckedAt: reply.lastCheckedAt, postings });
    }
    return { ok: true, postings, lastCheckedAt: reply.lastCheckedAt };
  } catch (error: unknown) {
    const authDenied = isAuthDeniedError(error);
    if (authDenied) await deps.clearStored();
    const message = error instanceof Error ? error.message : "공고를 불러오지 못했습니다.";
    return { ok: false, authDenied, error: message };
  }
}
