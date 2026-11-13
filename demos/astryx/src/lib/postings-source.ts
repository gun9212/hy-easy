import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isSchoolClaims } from "@lib/auth-policy";
import { loadPostings } from "@lib/data";
import type { Posting } from "@lib/domain";
import { samplePostings, DEMO_NOW } from "@lib/sample";
import { toDetail, toListPosting, type ListPosting, type PostingDetail } from "./list-posting";

export type SourceReason = "live" | "not-configured" | "signed-out" | "not-school" | "empty" | "error";
export type PostingsSource = { postings: ListPosting[]; now: string; reason: SourceReason };

const SAMPLE_ID = /^sample-\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sample = (reason: SourceReason): PostingsSource => ({
  postings: samplePostings.map(toListPosting),
  now: DEMO_NOW,
  reason,
});

type Session = { db: SupabaseClient; reason: "live" } | { db: null; reason: Exclude<SourceReason, "live"> };

/**
 * The visitor's own Supabase session, read from the cookie the main app set on the same host. Read-only: the main
 * app's proxy owns session refresh. No service key is used, so RLS decides what the demo may show.
 */
async function schoolSession(): Promise<Session> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { db: null, reason: "not-configured" };
  const jar = await cookies();
  const db = createServerClient(url, key, { cookies: { getAll: () => jar.getAll(), setAll: () => undefined } });
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims?.sub) return { db: null, reason: "signed-out" };
  if (!isSchoolClaims(data.claims)) return { db: null, reason: "not-school" };
  return { db, reason: "live" };
}

/** Real postings for a school session; the fictional sample, with the reason, for anyone else. */
export async function loadPostingsSource(): Promise<PostingsSource> {
  try {
    const session = await schoolSession();
    if (!session.db) return sample(session.reason);
    const postings = await loadPostings(session.db);
    if (postings.length === 0) return sample("empty");
    return { postings: postings.map(toListPosting), now: new Date().toISOString(), reason: "live" };
  } catch (cause) {
    console.error("[astryx-demo] loading postings failed", cause);
    return sample("error");
  }
}

/** One posting's long texts, under the same rules as the list. Null when the id is unknown or not visible. */
export async function loadPostingDetail(id: string): Promise<PostingDetail | null> {
  if (SAMPLE_ID.test(id)) {
    const found = samplePostings.find(p => p.id === id);
    return found ? toDetail(found) : null;
  }
  if (!UUID.test(id)) return null;
  const session = await schoolSession();
  if (!session.db) return null;
  const { data, error } = await session.db.from("posting_view").select("document").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDetail(data.document as Posting) : null;
}
