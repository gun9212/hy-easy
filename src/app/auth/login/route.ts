import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/auth";
import {
  authorizeUrl,
  OAUTH_COOKIE_MAX_AGE,
  OAUTH_COOKIE_PATH,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
  randomToken,
  siteOrigin,
} from "@/lib/google-oauth";
import { isConfigured, serverClient } from "@/lib/supabase/server";

/**
 * The link-based sign-in (the fallback under the Google button). With a Google client secret it goes through this
 * site's own callback, so Google shows hy-easy.vercel.app. Without one it falls back to Supabase's own OAuth flow,
 * which works the same but shows the Supabase project domain.
 */
export async function GET(request: Request) {
  const baseOrigin = requestOrigin(request);
  if (!isConfigured()) return NextResponse.redirect(new URL("/login?error=setup", baseOrigin));
  const origin = siteOrigin(request);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (clientId && process.env.GOOGLE_CLIENT_SECRET) {
    const state = randomToken(),
      nonce = randomToken();
    const response = NextResponse.redirect(authorizeUrl({ clientId, origin, state, nonce }));
    const cookie = {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax" as const,
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_COOKIE_MAX_AGE,
    };
    response.cookies.set(OAUTH_STATE_COOKIE, state, cookie);
    response.cookies.set(OAUTH_NONCE_COOKIE, nonce, cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const db = await serverClient();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { hd: "hanyang.ac.kr", prompt: "select_account" } },
  });
  if (error || !data.url) return NextResponse.redirect(new URL("/login?error=oauth", baseOrigin));
  return NextResponse.redirect(data.url);
}
