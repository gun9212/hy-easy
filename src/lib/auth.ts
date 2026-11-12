import { isSchoolClaims } from "./auth-policy";
import { isConfigured, serverClient } from "./supabase/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type SessionUser = { id: string; email: string; user_metadata: Record<string, unknown> };

/**
 * Verifies the session from the signed access token. getClaims checks the ES256 signature locally (the public key
 * is fetched once and cached), so a request no longer waits on the auth server as getUser did (25-55 ms each).
 */
export async function requireUser() {
  if (!isConfigured()) throw new HttpError(503, "Supabase 프로젝트가 연결되지 않았습니다.");
  const db = await serverClient();
  const { data, error } = await db.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) throw new HttpError(401, "로그인이 필요합니다.");
  if (!isSchoolClaims(claims)) throw new HttpError(403, "인증된 한양대 Google 계정으로 로그인해 주세요.");
  const user: SessionUser = { id: claims.sub, email: claims.email ?? "", user_metadata: claims.user_metadata ?? {} };
  return { db, user };
}
export async function requireAdmin() {
  const ctx = await requireUser();
  const { data } = await ctx.db.from("admins").select("user_id").eq("user_id", ctx.user.id).maybeSingle();
  if (!data) throw new HttpError(403, "관리자 권한이 필요합니다.");
  return ctx;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new HttpError(403, "허용되지 않은 요청입니다.");
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}
