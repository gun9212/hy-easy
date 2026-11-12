// Server-side cache of the posting list. Every school user sees the same postings and the collector changes them at
// most every five minutes, so one read serves all requests on this server instance for a minute.
// Callers must check the user first (requireUser): the cache is filled with the caller's own RLS client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPostings } from "./data";
import type { Posting } from "./domain";

export const POSTING_CACHE_TTL_MS = 60_000;

type Entry = { loadedAt: number; postings: Posting[] };
let entry: Entry | null = null;
let inflight: Promise<Posting[]> | null = null;

export async function cachedPostings(db: SupabaseClient, now: number = Date.now()): Promise<Posting[]> {
  if (entry && now - entry.loadedAt < POSTING_CACHE_TTL_MS) return entry.postings;
  // Concurrent misses share one database read.
  inflight ??= loadPostings(db)
    .then(postings => {
      // An empty list means the read saw nothing (e.g. a caller the database does not treat as a school user);
      // keeping it would show every student an empty list for a minute.
      if (postings.length) entry = { loadedAt: Date.now(), postings };
      return postings;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
