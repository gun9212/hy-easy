import { isSchoolUser } from "./auth-policy";
import { isConfigured, serverClient } from "./supabase/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser() {
  if (!isConfigured()) throw new HttpError(503, "Supabase 프로젝트가 연결되지 않았습니다.");
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new HttpError(401, "로그인이 필요합니다.");
  if (!isSchoolUser(user)) throw new HttpError(403, "인증된 한양대 Google 계정으로 로그인해 주세요.");
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
