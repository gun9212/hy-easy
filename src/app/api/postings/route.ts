import { requireUser, errorResponse } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data";
import { isMajor } from "@/lib/majors";
import { filtersFromSearchParams, queryPostings } from "@/lib/posting-query";

export async function GET(request: Request) {
  try {
    const { db, user } = await requireUser(),
      params = new URL(request.url).searchParams;
    const data = await loadWorkspace(db, user.id);
    const filters = filtersFromSearchParams(params);
    const major = isMajor(user.user_metadata?.major) ? user.user_metadata.major : null;
    const items = queryPostings(data.postings, filters, { favoriteIds: data.favoriteIds, major, now: new Date() });
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
