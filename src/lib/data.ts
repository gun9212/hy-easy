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

/** Every posting, newest first, read fresh (the admin page needs current data). */
export async function loadPostings(db: SupabaseClient): Promise<Posting[]> {
  const { data, error } = await db.from("posting_view").select("document").order("first_seen_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => row.document as Posting);
}

export async function loadWorkspace(db: SupabaseClient, userId: string) {
  const [postings, personal] = await Promise.all([loadPostings(db), loadPersonal(db, userId)]);
  return { postings, ...personal };
}
