/**
 * Links back to the main app (port 3000). The demo reads the main app's session cookie, and cookies are shared per
 * host, so the link must use the host the demo was opened with. Only loopback hosts are trusted: the Host header is
 * client-controlled, and anything else falls back to 127.0.0.1 instead of echoing an arbitrary domain into a link.
 */
export const MAIN_APP_PORT = 3000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const FALLBACK_HOST = "127.0.0.1";

/** "localhost:3100" → "localhost"; "[::1]:3100" → "[::1]"; unknown hosts → "127.0.0.1". */
export function trustedHostname(host: string | null): string {
  const hostname = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  return LOOPBACK_HOSTS.has(hostname) ? hostname : FALLBACK_HOST;
}

export function mainAppUrl(host: string | null, path: string): string {
  return `http://${trustedHostname(host)}:${MAIN_APP_PORT}${path.startsWith("/") ? path : `/${path}`}`;
}

export type SessionReason = "live" | "signed-out" | "expired" | "not-school";

/**
 * What the visitor's cookies say. A Supabase auth cookie that no longer verifies means the session expired (the demo
 * cannot refresh it; the main app's proxy does), which needs a different hint than never having signed in.
 */
export function sessionReason(input: {
  hasAuthCookie: boolean;
  hasValidClaims: boolean;
  isSchool: boolean;
}): SessionReason {
  if (!input.hasValidClaims) return input.hasAuthCookie ? "expired" : "signed-out";
  return input.isSchool ? "live" : "not-school";
}

/** Supabase SSR stores the session as "sb-<project>-auth-token", split into ".0", ".1"… when it is large. */
export function isAuthCookieName(name: string): boolean {
  return /^sb-[a-z0-9]+-auth-token(\.\d+)?$/i.test(name);
}
