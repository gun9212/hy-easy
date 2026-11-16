"use client";

import { useEffect, useState } from "react";
import type { Posting } from "@/lib/domain";
import { mergeSync, type SyncResponse } from "@/lib/posting-sync";
import { readStoredPostings, writeStoredPostings } from "./posting-store";
import type { Mode } from "./use-personal";

/** An open tab checks for changes this often while visible (the collector runs every ten minutes). */
const REFRESH_INTERVAL_MS = 10 * 60_000;
/** Returning to the tab re-checks only if the last check is at least this old (the server caches for a minute). */
const MIN_REFRESH_GAP_MS = 60_000;

export type PostingsState = {
  postings: Posting[];
  /** False until the first list (stored copy or server reply) is on screen. */
  ready: boolean;
  lastCheckedAt: string | null;
  error: string;
};

async function fetchSync(since: string | null): Promise<SyncResponse> {
  const response = await fetch(`/api/postings/sync${since ? `?since=${encodeURIComponent(since)}` : ""}`, {
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? "공고를 불러오지 못했습니다.");
  return data as SyncResponse;
}

/**
 * Brings the stored copy up to date: asks the server only for what changed since that copy.
 * On the first load the stored copy is shown before the server answers.
 */
async function syncPostings(onUpdate: (state: PostingsState) => void, showStored: boolean): Promise<void> {
  const stored = await readStoredPostings();
  if (stored && showStored) {
    onUpdate({ postings: stored.postings, ready: true, lastCheckedAt: stored.lastCheckedAt, error: "" });
  }
  let reply = await fetchSync(stored?.syncedAt ?? null);
  let postings = reply.full ? reply.postings : mergeSync(stored?.postings ?? [], reply);
  if (!postings) {
    reply = await fetchSync(null);
    postings = reply.postings;
  }
  onUpdate({ postings, ready: true, lastCheckedAt: reply.lastCheckedAt, error: "" });
  if (reply.syncedAt) {
    await writeStoredPostings({ syncedAt: reply.syncedAt, lastCheckedAt: reply.lastCheckedAt, postings });
  }
}

/**
 * Demo mode uses the postings it was given. Live mode loads them in the browser (see syncPostings) and keeps an
 * open tab current: every ten minutes while visible, and when the student comes back to the tab.
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
    const run = (showStored: boolean) => {
      if (running || cancelled) return;
      running = true;
      lastRun = Date.now();
      syncPostings(next => {
        if (!cancelled) setState(next);
      }, showStored)
        .catch((e: unknown) => {
          if (cancelled) return;
          const message = e instanceof Error ? e.message : "공고를 불러오지 못했습니다.";
          setState(prev => ({ ...prev, ready: true, error: message }));
        })
        .finally(() => {
          running = false;
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun >= MIN_REFRESH_GAP_MS) run(false);
    };
    run(true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") run(false);
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
