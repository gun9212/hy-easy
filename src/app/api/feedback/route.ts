import { errorResponse, HttpError, requireUser, sameOrigin } from "@/lib/auth";
import { FEEDBACK_MAX_CHARS, feedbackSchema } from "@/lib/feedback";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db } = await requireUser();
    const input = feedbackSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new HttpError(400, `피드백은 1자 이상 ${FEEDBACK_MAX_CHARS}자 이하로 적어 주세요.`);
    // No .select(): the sender cannot read feedback back, so the insert asks for no returned row.
    const { error } = await db.from("feedback").insert({ message: input.data.message, page: input.data.page ?? null });
    if (error) throw error;
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
