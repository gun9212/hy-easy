import { z } from "zod";
import { requireUser, sameOrigin, errorResponse, HttpError } from "@/lib/auth";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const { db } = await requireUser();
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success) throw new HttpError(400, "올바른 공고를 선택해 주세요.");
    const { error } = await db.rpc("delete_application", { p_posting: parsed.data });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
