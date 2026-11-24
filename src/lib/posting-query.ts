// Shared posting list query used by both /api/postings and PostingsView so API and screen always agree
// on major filtering, recruitment-window ("when") filtering, and the default deadline sort.
import { filterPostings, normalizeFilters, type Filters, type Posting } from "./domain";
import type { Major } from "./majors";
import { matchesWhen } from "./posting-format";

export const DEFAULT_POSTING_SORT = "deadline" as const;

export function filtersFromSearchParams(params: URLSearchParams): Filters {
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length > 1 ? values : (values[0] ?? "");
  }
  return normalizeFilters(raw);
}

export function queryPostings(
  postings: Posting[],
  rawFilters: Filters,
  options: {
    favoriteIds?: string[];
    major?: Major | null;
    now?: Date;
    /** Ids the server matched on source texts the list copy does not carry (see useBodySearch). */
    textMatchIds?: ReadonlySet<string> | null;
  } = {},
): Posting[] {
  const { favoriteIds = [], major = null, now = new Date(), textMatchIds = null } = options;
  const filters: Filters = { ...rawFilters, sort: rawFilters.sort || DEFAULT_POSTING_SORT };
  return filterPostings(postings, filters, favoriteIds, major, textMatchIds).filter(p =>
    matchesWhen(p, filters.when, now),
  );
}
