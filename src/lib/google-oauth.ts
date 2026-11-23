import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Google sign-in through this site's own callback (/auth/google/callback), so Google's screens name
 * hy-easy.vercel.app instead of the Supabase project domain. The callback trades the code for an ID token and hands
 * it to Supabase (signInWithIdToken), the same way the Google button's credential is handled in /auth/google.
 */
export const OAUTH_STATE_COOKIE = "hy-oauth-state";
export const OAUTH_NONCE_COOKIE = "hy-oauth-nonce";
export const OAUTH_COOKIE_PATH = "/auth/google";
export const OAUTH_COOKIE_MAX_AGE = 600;
export const CALLBACK_PATH = "/auth/google/callback";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Google signs this hash into the ID token; Supabase checks it against the raw nonce kept in a cookie. */
export function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

export function authorizeUrl(options: { clientId: string; origin: string; state: string; nonce: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.origin + CALLBACK_PATH,
    response_type: "code",
    scope: "openid email profile",
    state: options.state,
    nonce: hashNonce(options.nonce),
    hd: "hanyang.ac.kr",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Constant-time comparison of the state Google returned with the one this browser was given. */
export function stateMatches(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected),
    b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

/** The site origin Google redirects back to; it must match an authorized redirect URI in the Google console. */
export function siteOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}
