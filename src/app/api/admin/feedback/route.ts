import { errorResponse, HttpError, requireAdmin, sameOrigin } from "@/lib/auth";
import { adminFeedbackMarkReadSchema } from "@/lib/feedback";

// Marks one feedback row read ({ id }), a page subset ({ ids }), or every unread row ({}).
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db } = await requireAdmin();
    const input = adminFeedbackMarkReadSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new HttpError(400, "읽음 처리할 피드백을 확인해 주세요.");
    let query = db.from("feedback").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (input.data.id) query = query.eq("id", input.data.id);
    else if (input.data.ids) query = query.in("id", input.data.ids);
    const { error } = await query;
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
