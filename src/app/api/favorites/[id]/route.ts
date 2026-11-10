import { z } from "zod";
import { requireUser, sameOrigin, errorResponse, HttpError } from "@/lib/auth";
async function mutate(request: Request, params: Promise<{ id: string }>, remove: boolean) {
  try {
    sameOrigin(request);
    const { db, user } = await requireUser();
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success) throw new HttpError(400, "올바른 공고를 선택해 주세요.");
    const result = remove
      ? await db.from("favorites").delete().eq("user_id", user.id).eq("posting_id", parsed.data)
      : await db.from("favorites").upsert({ user_id: user.id, posting_id: parsed.data }, { ignoreDuplicates: true });
    if (result.error) throw result.error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mutate(request, params, false);
}
export function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mutate(request, params, true);
}
