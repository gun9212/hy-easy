import { requireUser, errorResponse, HttpError } from "@/lib/auth";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireUser(),
      { id } = await params;
    const { data, error } = await db.from("posting_view").select("document").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "공고를 찾을 수 없습니다.");
    return Response.json(data.document, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
