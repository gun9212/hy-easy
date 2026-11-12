"use client";

import { useEffect, useState } from "react";
import type { Posting } from "@/lib/domain";
import { mergeSync, type SyncResponse } from "@/lib/posting-sync";
import { readStoredPostings, writeStoredPostings } from "./posting-store";
import type { Mode } from "./use-personal";

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

/** Shows the stored copy at once, then asks the server only for what changed since that copy. */
async function syncPostings(onUpdate: (state: PostingsState) => void): Promise<void> {
  const stored = await readStoredPostings();
  if (stored) onUpdate({ postings: stored.postings, ready: true, lastCheckedAt: stored.lastCheckedAt, error: "" });
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

/** Demo mode uses the postings it was given; live mode loads them in the browser (see syncPostings). */
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
    syncPostings(next => {
      if (!cancelled) setState(next);
    }).catch((e: unknown) => {
      if (cancelled) return;
      const message = e instanceof Error ? e.message : "공고를 불러오지 못했습니다.";
      setState(prev => ({ ...prev, ready: true, error: message }));
    });
    return () => {
      cancelled = true;
    };
  }, [mode, initial]);
  return state;
}
