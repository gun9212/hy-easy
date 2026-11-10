import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application, Posting } from "./domain";

export async function loadWorkspace(db: SupabaseClient, userId: string) {
  const [postings, favorites, applications] = await Promise.all([
    db.from("posting_view").select("document").order("first_seen_at", { ascending: false }),
    db.from("favorites").select("posting_id").eq("user_id", userId),
    db.from("applications").select("id,posting_id,status,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }),
  ]);
  for (const result of [postings, favorites, applications]) if (result.error) throw new Error(result.error.message);
  return {
    postings: (postings.data ?? []).map(row => row.document as Posting),
    favoriteIds: (favorites.data ?? []).map(row => String(row.posting_id)),
    applications: (applications.data ?? []).map(row => ({ id: row.id, postingId: row.posting_id, status: row.status, updatedAt: row.updated_at }) as Application),
  };
}
