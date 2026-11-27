import { MAX_SEARCH_QUERY_CHARS, type Filters } from "./domain";

export type WorkspaceView = "postings" | "saved" | "planner";

export function viewOfFilters(filters: Filters): WorkspaceView {
  if (filters.saved === "planner") return "planner";
  return filters.saved === "true" ? "saved" : "postings";
}

export function searchOfFilters(filters: Filters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    const bounded = key === "q" ? value.slice(0, MAX_SEARCH_QUERY_CHARS) : value;
    if (bounded) params.set(key, bounded);
  });
  return params.size ? `?${params}` : "";
}

/**
 * Primary view transitions (postings <-> saved <-> planner) and top-level "when" shortcuts push a browser
 * history entry so Back returns to the previous screen; incremental search typing and filter tweaks replace
 * the current entry instead of flooding the history stack.
 */
export function shouldPushHistory(prev: Filters, next: Filters): boolean {
  if (viewOfFilters(prev) !== viewOfFilters(next)) return true;
  if ((prev.q ?? "") !== (next.q ?? "")) return false;
  if ((prev.when ?? "") !== (next.when ?? "")) return true;
  return false;
}
