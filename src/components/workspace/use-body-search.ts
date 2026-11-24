"use client";

import { useEffect, useState } from "react";
import { searchQuery } from "@/lib/domain";
import { MAX_SEARCH_QUERY_CHARS } from "@/lib/posting-body";
import type { Mode } from "./use-personal";

/** Wait this long after the last keystroke before asking the server. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Ids of postings whose source texts or attachment text match the search box, from the server (the synced list has
 * no source texts). Company, title and department still match in the browser at once; these ids are added when the
 * answer arrives. Null in demo mode (sample postings carry their texts), with no query, or after a failed request.
 */
export function useBodySearch(mode: Mode, q: string | undefined): ReadonlySet<string> | null {
  const query = searchQuery(q).slice(0, MAX_SEARCH_QUERY_CHARS);
  const [result, setResult] = useState<{ query: string; ids: ReadonlySet<string> } | null>(null);

  useEffect(() => {
    if (mode === "demo" || !query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/postings/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query }),
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async response => {
          const data = (await response.json().catch(() => null)) as { ids?: unknown } | null;
          if (!response.ok || !Array.isArray(data?.ids)) return;
          setResult({ query, ids: new Set(data.ids.map(String)) });
        })
        .catch(() => {
          // Aborted by the next keystroke, or offline: the browser-side match on company, title and department stands.
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query]);

  return result && result.query === query ? result.ids : null;
}
