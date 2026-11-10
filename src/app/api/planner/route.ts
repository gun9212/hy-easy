import { z } from "zod";
import { requireUser, sameOrigin, errorResponse, HttpError } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data";
import { eligibility, simulate } from "@/lib/domain";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await requireUser();
    const input = z
      .object({ postingId: z.uuid(), releaseAt: z.string().datetime({ offset: true }).optional() })
      .strict()
      .safeParse(await request.json());
    if (!input.success) throw new HttpError(400, "공고와 가정 시각을 확인해 주세요.");
    const data = await loadWorkspace(db, user.id),
      p = data.postings.find(p => p.id === input.data.postingId);
    if (!p) throw new HttpError(404, "공고를 찾을 수 없습니다.");
    return Response.json(input.data.releaseAt ? simulate(p, input.data.releaseAt) : eligibility(p, data.applications), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
