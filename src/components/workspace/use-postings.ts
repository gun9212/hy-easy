"use client";

import { useEffect, useState } from "react";
import type { Posting } from "@/lib/domain";
import {
  applyPostingSyncOutcome,
  syncBrowserPostings,
  SyncHttpError,
  type PostingsViewState,
  type SyncResponse,
} from "@/lib/posting-sync";
import { clearStoredPostings, readStoredPostings, writeStoredPostings } from "./posting-store";
import type { Mode } from "./use-personal";

/** An open tab checks for changes this often while visible (the collector runs every ten minutes). */
const REFRESH_INTERVAL_MS = 10 * 60_000;
/** Returning to the tab re-checks only if the last check is at least this old (the server caches for a minute). */
const MIN_REFRESH_GAP_MS = 60_000;

export type PostingsState = PostingsViewState;

async function fetchSync(since: string | null): Promise<SyncResponse> {
  const response = await fetch(`/api/postings/sync${since ? `?since=${encodeURIComponent(since)}` : ""}`, {
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SyncHttpError(
      response.status,
      (data as { error?: string } | null)?.error ?? "공고를 불러오지 못했습니다.",
    );
  }
  return data as SyncResponse;
}

/**
 * Demo mode uses the postings it was given. Live mode verifies school eligibility with `/api/postings/sync`
 * before rendering any cached postings, clears both screen state and IndexedDB on 401/403, and keeps an open
 * tab current every ten minutes while visible or when the student returns to the tab.
 */
export function usePostings(mode: Mode, initial: Posting[] | null): PostingsState {
  const [state, setState] = useState<PostingsState>({
    postings: initial ?? [],
    ready: mode === "demo" || initial !== null,
    lastCheckedAt: null,
    error: "",
  });
  useEffect(() => {
    if (mode === "demo" || initial !== null) return;
    let cancelled = false;
    let running = false;
    let lastRun = 0;
    const run = () => {
      if (running || cancelled) return;
      running = true;
      lastRun = Date.now();
      syncBrowserPostings({
        readStored: readStoredPostings,
        writeStored: writeStoredPostings,
        clearStored: clearStoredPostings,
        fetchSync,
      })
        .then(outcome => {
          if (cancelled) return;
          setState(prev => applyPostingSyncOutcome(prev, outcome));
        })
        .finally(() => {
          running = false;
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun >= MIN_REFRESH_GAP_MS) run();
    };
    run();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode, initial]);
  return state;
}
