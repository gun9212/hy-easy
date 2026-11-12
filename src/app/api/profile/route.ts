import { z } from "zod";
import { requireUser, sameOrigin, errorResponse, HttpError } from "@/lib/auth";
import { isMajor } from "@/lib/majors";

// Saves the student's major (one Seoul-campus major, or null to clear) in their own auth user metadata.
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db } = await requireUser();
    const input = z
      .object({ major: z.string().nullable() })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!input.success || (input.data.major !== null && !isMajor(input.data.major)))
      throw new HttpError(400, "전공을 목록에서 골라 주세요.");
    const { error } = await db.auth.updateUser({ data: { major: input.data.major } });
    if (error) throw new HttpError(500, "전공을 저장하지 못했습니다.");
    return Response.json({ major: input.data.major }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
