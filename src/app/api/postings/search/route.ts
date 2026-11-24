import { requireUser, errorResponse, sameOrigin, HttpError } from "@/lib/auth";
import { matchesSearch, searchQuery } from "@/lib/domain";
import { MAX_SEARCH_QUERY_CHARS } from "@/lib/posting-body";
import { cachedPostings } from "@/lib/posting-cache";

// POST /api/postings/search {"q": "<text>"}: ids of postings whose company, title, department, source texts or
// attachment text contain q. The browser's list copy has no source texts, so it asks here and merges the ids into its
// filter. A POST body keeps the search text out of URLs and request logs.
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db } = await requireUser();
    const body: unknown = await request.json().catch(() => null);
    const q = (body as { q?: unknown } | null)?.q;
    if (typeof q !== "string" || q.length > MAX_SEARCH_QUERY_CHARS) throw new HttpError(400, "검색어를 확인해 주세요.");
    const query = searchQuery(q);
    const ids = query ? (await cachedPostings(db)).filter(p => matchesSearch(p, query)).map(p => p.id) : [];
    return Response.json({ ids }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
