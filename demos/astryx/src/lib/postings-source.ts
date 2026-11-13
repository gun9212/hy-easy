import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSchoolClaims } from "@lib/auth-policy";
import { loadPostings } from "@lib/data";
import type { Posting } from "@lib/domain";
import { samplePostings, DEMO_NOW } from "@lib/sample";

export type SourceReason = "live" | "not-configured" | "signed-out" | "not-school" | "empty" | "error";
export type PostingsSource = { postings: Posting[]; now: string; reason: SourceReason };

const SAMPLE = (reason: SourceReason): PostingsSource => ({ postings: samplePostings, now: DEMO_NOW, reason });

/**
 * Real postings through the student's own session, under the same RLS as the main app.
 * The demo runs on the same host as the main app, so the browser sends the main app's Supabase cookie here too;
 * no service key is used. Anyone the database would not show postings to gets the fictional sample instead.
 */
export async function loadPostingsSource(): Promise<PostingsSource> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return SAMPLE("not-configured");
  const jar = await cookies();
  // Read-only: the main app's proxy owns session refresh, so this client never writes cookies.
  const db = createServerClient(url, key, { cookies: { getAll: () => jar.getAll(), setAll: () => undefined } });
  try {
    const { data, error } = await db.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) return SAMPLE("signed-out");
    if (!isSchoolClaims(claims)) return SAMPLE("not-school");
    const postings = await loadPostings(db);
    if (postings.length === 0) return SAMPLE("empty");
    return { postings, now: new Date().toISOString(), reason: "live" };
  } catch (cause) {
    console.error("[astryx-demo] loading postings failed", cause);
    return SAMPLE("error");
  }
}
