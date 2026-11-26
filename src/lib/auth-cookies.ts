// Session cookie cleanup and logout orchestration so browser logout still completes even when the
// upstream Supabase Auth server fails to revoke the refresh token.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requestOrigin, sameOrigin } from "./auth";
import { isConfigured, serverClient } from "./supabase/server";

const SUPABASE_AUTH_COOKIE = /^sb-[a-z0-9-]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/i;
const SAFE_CODE = /^[A-Za-z0-9_.-]{2,48}$/;

/** Extracts cookie names from a raw Cookie header without retaining or logging cookie values. */
export function parseCookieNames(header: string | null): string[] {
  if (!header) return [];
  const names: string[] = [];
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    const name = (eq >= 0 ? part.slice(0, eq) : part).trim();
    if (name) names.push(name);
  }
  return names;
}

/** Derives Supabase's project ref (first hostname label) from NEXT_PUBLIC_SUPABASE_URL when valid. */
export function supabaseProjectRef(supabaseUrl?: string): string | null {
  if (!supabaseUrl) return null;
  try {
    const label = new URL(supabaseUrl).hostname.split(".")[0] ?? "";
    return /^[a-z0-9-]+$/i.test(label) ? label : null;
  } catch {
    return null;
  }
}

/** Returns all Supabase auth session cookies, numbered chunks (.0, .1, ...), and PKCE verifiers to expire. */
export function supabaseAuthCookieNames(incomingNames: Iterable<string>, supabaseUrl?: string): string[] {
  const result = new Set<string>();
  const ref = supabaseProjectRef(supabaseUrl);
  if (ref) {
    result.add(`sb-${ref}-auth-token`);
    result.add(`sb-${ref}-auth-token-code-verifier`);
  }
  for (const name of incomingNames) {
    if (SUPABASE_AUTH_COOKIE.test(name)) result.add(name);
  }
  return [...result];
}

/** Maps an upstream signOut failure to a bounded code without leaking tokens, emails, or raw payloads. */
export function revocationErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
      return `HTTP_${status}`;
    }
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && SAFE_CODE.test(code)) return code;
  }
  return "SIGNOUT_REQUEST_FAILED";
}

export function expireAuthCookies(response: NextResponse, cookieNames: Iterable<string>, secure: boolean): void {
  for (const name of cookieNames) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      sameSite: "lax",
      secure,
    });
  }
}

export type LogoutAuthClient = {
  auth: {
    signOut: (options?: { scope?: "global" | "local" | "others" }) => Promise<{ error: unknown }>;
  };
};

export type LogoutDeps = {
  isConfigured: () => boolean;
  supabaseUrl: () => string | undefined;
  createClient: () => Promise<LogoutAuthClient>;
  readJarCookieNames: () => Promise<string[]>;
  logRevocationFailure: (code: string) => void;
};

const defaultLogoutDeps: LogoutDeps = {
  isConfigured,
  supabaseUrl: () => process.env.NEXT_PUBLIC_SUPABASE_URL,
  createClient: serverClient,
  readJarCookieNames: async () => {
    try {
      const jar = await cookies();
      return jar.getAll().map(c => c.name);
    } catch {
      return [];
    }
  },
  logRevocationFailure: code => {
    console.error(JSON.stringify({ severity: "WARNING", event: "logout_revocation_failed", code }));
  },
};

export async function performLogout(request: Request, deps: LogoutDeps = defaultLogoutDeps): Promise<NextResponse> {
  sameOrigin(request);
  const incomingNames = new Set(parseCookieNames(request.headers.get("cookie")));
  let revocationFailure: string | null = null;

  if (deps.isConfigured()) {
    try {
      const db = await deps.createClient();
      const signOutResult = await db.auth.signOut().catch((err: unknown) => ({ error: err }));
      if (signOutResult?.error) {
        revocationFailure = revocationErrorCode(signOutResult.error);
        await db.auth.signOut({ scope: "local" }).catch(() => null);
      }
    } catch (err: unknown) {
      revocationFailure = revocationErrorCode(err);
    }
  }

  if (revocationFailure) {
    deps.logRevocationFailure(revocationFailure);
  }

  for (const name of await deps.readJarCookieNames()) incomingNames.add(name);

  const toExpire = supabaseAuthCookieNames(incomingNames, deps.supabaseUrl());
  const origin = requestOrigin(request);
  const response = NextResponse.redirect(new URL("/login", origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  expireAuthCookies(response, toExpire, origin.startsWith("https://"));
  return response;
}
