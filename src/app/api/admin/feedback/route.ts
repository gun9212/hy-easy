import { z } from "zod";
import { errorResponse, HttpError, requireAdmin, sameOrigin } from "@/lib/auth";

// Marks one feedback row read, or every unread row without an id.
const body = z.object({ id: z.string().uuid().optional() }).strict();

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db } = await requireAdmin();
    const input = body.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new HttpError(400, "읽음 처리할 피드백을 확인해 주세요.");
    let query = db.from("feedback").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (input.data.id) query = query.eq("id", input.data.id);
    const { error } = await query;
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
