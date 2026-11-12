import { NextResponse } from "next/server";
import { z } from "zod";
import { isSchoolUser } from "@/lib/auth-policy";
import { isConfigured, serverClient } from "@/lib/supabase/server";

// Exchanges a Google Identity Services ID token for a Supabase session (cookies are set by the server client).
const bodySchema = z.object({
  credential: z.string().min(20).max(8192),
  nonce: z.string().min(16).max(128),
});

function reply(redirect: string, status = 200) {
  return NextResponse.json({ redirect }, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isConfigured()) return reply("/login?error=setup", 503);
  if (!sameOrigin(request)) return reply("/login?error=oauth", 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply("/login?error=oauth", 400);

  const db = await serverClient();
  const { error } = await db.auth.signInWithIdToken({
    provider: "google",
    token: parsed.data.credential,
    nonce: parsed.data.nonce,
  });
  if (error) {
    console.error("google id token sign-in failed", { status: error.status, code: error.code });
    return reply("/login?error=oauth", 401);
  }
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!isSchoolUser(user)) {
    await db.auth.signOut();
    return reply("/login?error=school", 403);
  }
  return reply("/postings");
}
