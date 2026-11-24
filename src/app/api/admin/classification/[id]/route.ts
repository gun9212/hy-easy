import { requireAdmin, sameOrigin, errorResponse, HttpError } from "@/lib/auth";
import { classificationSchema } from "@/lib/classification-schema";
import { assertEvidence, type Posting } from "@/lib/domain";
import { classificationInput } from "@/lib/normalize";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const { db } = await requireAdmin(),
      { id } = await params;
    const input = classificationSchema.safeParse(await request.json());
    if (!input.success) throw new HttpError(400, "직군과 설명, 원문 근거를 확인해 주세요.");
    const { data, error } = await db.from("posting_view").select("document").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "공고를 찾을 수 없습니다.");
    let checked;
    try {
      // Same fields the classifier saw, so evidence quoted from an attached file is accepted too.
      // Saves the checked copy: a quote found under another field is stored with its real field.
      checked = assertEvidence(classificationInput(data.document as Posting), input.data);
    } catch {
      throw new HttpError(400, "분류 근거가 원문과 일치하지 않습니다.");
    }
    const result = await db.rpc("override_classification", { p_posting: id, p_result: checked });
    if (result.error) throw result.error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
