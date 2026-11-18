import { z } from "zod";
import { requireAdmin, sameOrigin, errorResponse, HttpError } from "@/lib/auth";

// Without a postingId every queued posting that has used up its attempts gets another try.
const body = z.object({ postingId: z.string().uuid().optional() }).strict();

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db } = await requireAdmin();
    const input = body.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new HttpError(400, "재시도할 공고를 확인해 주세요.");
    const { data, error } = await db.rpc("retry_classification", { p_posting: input.data.postingId ?? null });
    if (error) throw error;
    return Response.json({ ok: true, reset: data as number });
  } catch (e) {
    return errorResponse(e);
  }
}
