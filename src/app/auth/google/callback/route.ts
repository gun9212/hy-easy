import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/auth";
import { isSchoolUser } from "@/lib/auth-policy";
import {
  CALLBACK_PATH,
  OAUTH_COOKIE_PATH,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
  readCookie,
  siteOrigin,
  stateMatches,
  TOKEN_URL,
} from "@/lib/google-oauth";
import { isConfigured, serverClient } from "@/lib/supabase/server";

/** Ends the sign-in /auth/login started: checks state, trades the code for an ID token, opens a Supabase session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseOrigin = requestOrigin(request);
  const done = (path: string) => {
    const response = NextResponse.redirect(new URL(path, baseOrigin));
    // The one-time state and nonce are spent either way.
    for (const name of [OAUTH_STATE_COOKIE, OAUTH_NONCE_COOKIE])
      response.cookies.set(name, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return response;
  };
  const code = url.searchParams.get("code");
  const nonce = readCookie(request, OAUTH_NONCE_COOKIE);
  if (!stateMatches(readCookie(request, OAUTH_STATE_COOKIE), url.searchParams.get("state")) || !code || !nonce)
    return done("/login?error=oauth");
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!isConfigured() || !clientId || !clientSecret) return done("/login?error=setup");

  const token = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: siteOrigin(request) + CALLBACK_PATH,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  }).catch(() => null);
  const body = (await token?.json().catch(() => null)) as { id_token?: unknown; error?: unknown } | null;
  if (!token?.ok || typeof body?.id_token !== "string") {
    console.error("google code exchange failed", { status: token?.status, error: body?.error });
    return done("/login?error=oauth");
  }

  const db = await serverClient();
  const { error } = await db.auth.signInWithIdToken({ provider: "google", token: body.id_token, nonce });
  if (error) {
    console.error("google id token sign-in failed", { status: error.status, code: error.code });
    return done("/login?error=oauth");
  }
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!isSchoolUser(user)) {
    await db.auth.signOut();
    return done("/login?error=school");
  }
  return done("/postings");
}
