import { requireUser, errorResponse } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data";
import { filterPostings, type Filters } from "@/lib/domain";
export async function GET(request: Request) {
  try {
    const { db, user } = await requireUser(),
      params = new URL(request.url).searchParams;
    const data = await loadWorkspace(db, user.id),
      filters = Object.fromEntries(params) as Filters;
    const items = filterPostings(data.postings, filters, data.favoriteIds);
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1)),
      size = 20;
    return Response.json(
      { items: items.slice((page - 1) * size, page * size), total: items.length, page, pageSize: size },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
