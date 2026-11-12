import { requireUser, errorResponse } from "@/lib/auth";
import { cachedPostings } from "@/lib/posting-cache";
import { buildSync } from "@/lib/posting-sync";

// GET /api/postings/sync?since=<syncedAt from the browser's copy>. Without `since`, every posting is returned.
export async function GET(request: Request) {
  try {
    const { db } = await requireUser();
    const since = new URL(request.url).searchParams.get("since");
    const postings = await cachedPostings(db);
    return Response.json(buildSync(postings, since), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
