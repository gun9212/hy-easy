// Shared posting list query used by both /api/postings and PostingsView so API and screen always agree
// on major filtering, recruitment-window ("when") filtering, and the default deadline sort.
import { filterPostings, isRole, normalizeFilters, type Filters, type Posting } from "./domain";
import { sanitizeFiltersForPostings } from "./filter-options";
import type { Major } from "./majors";
import { matchesWhen } from "./posting-format";

export const DEFAULT_POSTING_SORT = "deadline" as const;

const WHEN_TITLES: Record<string, string> = {
  open: "모집 중인 공고",
  soon: "마감 임박",
  new: "신규 공고",
};

/** The page title for the list: 관심 공고, a side-nav shortcut, a known role in ROLES, or 전체 공고. */
export function listTitle(filters: Filters): string {
  if (filters.saved === "true") return "관심 공고";
  if (filters.when && Object.hasOwn(WHEN_TITLES, filters.when)) return WHEN_TITLES[filters.when];
  return isRole(filters.role) ? filters.role : "전체 공고";
}

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
  const sanitized = sanitizeFiltersForPostings(rawFilters, postings);
  const filters: Filters = { ...sanitized, sort: sanitized.sort || DEFAULT_POSTING_SORT };
  return filterPostings(postings, filters, favoriteIds, major, textMatchIds).filter(p =>
    matchesWhen(p, filters.when, now),
  );
}
