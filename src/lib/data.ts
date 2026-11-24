import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application, Posting } from "./domain";

/** The student's own favorites and applications. Small, so it is read fresh on every request. */
export async function loadPersonal(db: SupabaseClient, userId: string) {
  const [favorites, applications] = await Promise.all([
    db.from("favorites").select("posting_id").eq("user_id", userId),
    db
      .from("applications")
      .select("id,posting_id,status,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
  ]);
  for (const result of [favorites, applications]) if (result.error) throw new Error(result.error.message);
  return {
    favoriteIds: (favorites.data ?? []).map(row => String(row.posting_id)),
    applications: (applications.data ?? []).map(
      row => ({ id: row.id, postingId: row.posting_id, status: row.status, updatedAt: row.updated_at }) as Application,
    ),
  };
}

/** Batch size per PostgREST range query (below Supabase's default 1,000-row API cap). */
export const POSTING_PAGE_SIZE = 500;
const MAX_POSTING_PAGES = 100;

/**
 * Every posting in a deterministic order (newest first, tie-broken by id), paginated until the final page.
 * Advances by the actual number of rows returned so a lower PostgREST max_rows cap never truncates the list.
 */
export async function loadPostings(db: SupabaseClient, pageSize = POSTING_PAGE_SIZE): Promise<Posting[]> {
  const seen = new Set<string>();
  const postings: Posting[] = [];
  let offset = 0;
  let expectedCount: number | null = null;

  for (let page = 0; page < MAX_POSTING_PAGES; page += 1) {
    const { data, error, count } = await db
      .from("posting_view")
      .select("document", page === 0 ? { count: "exact" } : undefined)
      .order("first_seen_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (page === 0 && typeof count === "number") expectedCount = count;

    const rows = data ?? [];
    if (rows.length === 0) {
      if (expectedCount !== null && offset < expectedCount) {
        throw new Error(`Incomplete posting read: received ${offset} of ${expectedCount} rows`);
      }
      return postings;
    }

    for (const row of rows) {
      const posting = row.document as Posting;
      if (!seen.has(posting.id)) {
        seen.add(posting.id);
        postings.push(posting);
      }
    }
    offset += rows.length;

    if (expectedCount !== null ? offset >= expectedCount : rows.length < pageSize) {
      return postings;
    }
  }
  throw new Error(`Posting read exceeded ${MAX_POSTING_PAGES} pages before reaching the end`);
}

export async function loadWorkspace(db: SupabaseClient, userId: string) {
  const [postings, personal] = await Promise.all([loadPostings(db), loadPersonal(db, userId)]);
  return { postings, ...personal };
}
