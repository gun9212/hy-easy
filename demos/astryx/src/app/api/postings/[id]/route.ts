import { NextResponse } from "next/server";
import { loadPostingDetail } from "@demo/lib/postings-source";

/** The drawer's long texts for one posting. Same session and RLS as the page; 404 for an unknown or hidden id. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const detail = await loadPostingDetail(id);
    if (!detail) return NextResponse.json({ error: "공고를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (cause) {
    console.error("[astryx-demo] loading posting detail failed", id, cause);
    return NextResponse.json({ error: "공고 내용을 읽지 못했습니다." }, { status: 500 });
  }
}
