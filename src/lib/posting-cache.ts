// Server-side cache of the posting list. Every school user sees the same postings and the collector changes them at
// most every ten minutes, so one read serves all requests on this server instance for a minute.
// Callers must pass requireUser first, and every call re-checks public.is_school_user() in the database so cache hits
// and concurrent misses enforce the exact same eligibility policy as RLS on posting_view.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertDbSchoolUser } from "./auth";
import { loadPostings } from "./data";
import type { Posting } from "./domain";

export const POSTING_CACHE_TTL_MS = 60_000;

type Entry = { loadedAt: number; postings: Posting[] };
let entry: Entry | null = null;
let inflight: Promise<Posting[]> | null = null;

export async function cachedPostings(db: SupabaseClient, now: number = Date.now()): Promise<Posting[]> {
  await assertDbSchoolUser(db);
  if (entry && now - entry.loadedAt < POSTING_CACHE_TTL_MS) return entry.postings;
  // Concurrent misses share one database read after each caller passes the DB school-user check.
  inflight ??= loadPostings(db)
    .then(postings => {
      // An empty list means the read saw nothing; keeping it would show every student an empty list for a minute.
      if (postings.length) entry = { loadedAt: Date.now(), postings };
      return postings;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test helper to clear module cache state between isolated test cases. */
export function resetPostingCacheForTest(): void {
  entry = null;
  inflight = null;
}
