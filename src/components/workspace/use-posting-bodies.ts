"use client";

import { useEffect, useState } from "react";
import type { Posting } from "@/lib/domain";

// Full postings (with source texts) for the detail and comparison screens. The synced list leaves the texts out
// (see posting-body.ts), so they are fetched per posting on open and kept in memory only, never in IndexedDB.
// A full page load (including logout) clears them.

const loaded = new Map<string, Posting>();
const inflight = new Map<string, Promise<Posting>>();

/** A posting's version: a changed source text gets a new changedAt, so an older full copy is not reused. */
const keyOf = (p: Posting) => `${p.id}|${p.changedAt ?? p.updatedAt}`;

async function fetchFull(id: string): Promise<Posting> {
  const response = await fetch(`/api/postings/${encodeURIComponent(id)}`, { cache: "no-store" });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !data || (data as Posting).id !== id) {
    throw new Error((data as { error?: string } | null)?.error ?? "공고 원문을 불러오지 못했습니다.");
  }
  return data as Posting;
}

/** Starts (or joins) loading one posting's full copy. List copies without bodyOmitted are already full. */
export function loadPostingBody(p: Posting): Promise<Posting> {
  if (!p.bodyOmitted) return Promise.resolve(p);
  const key = keyOf(p);
  const done = loaded.get(key);
  if (done) return Promise.resolve(done);
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchFull(p.id)
      .then(full => {
        // Live fields come from the list, which the open tab keeps current.
        const merged = { ...full, applicants: p.applicants, lastCheckedAt: p.lastCheckedAt };
        delete merged.bodyOmitted;
        loaded.set(key, merged);
        return merged;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

export type BodiesState = {
  /** The given postings, each replaced by its full copy once loaded. */
  postings: Posting[];
  status: "ready" | "loading" | "error";
  retry: () => void;
};

/** Full copies of the given postings, loading the missing ones. */
export function usePostingBodies(postings: Posting[]): BodiesState {
  const [, setVersion] = useState(0);
  const [failedTag, setFailedTag] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const keys = postings.map(keyOf).join(",");
  /** Which request a failure belongs to: a later posting set or a retry starts as loading again. */
  const tag = `${keys}#${attempt}`;
  const resolved = postings.map(p => (p.bodyOmitted ? (loaded.get(keyOf(p)) ?? p) : p));
  const missing = resolved.some(p => p.bodyOmitted);

  useEffect(() => {
    if (!missing) return;
    let active = true;
    Promise.all(postings.map(loadPostingBody))
      .then(() => {
        if (active) setVersion(v => v + 1);
      })
      .catch(() => {
        if (active) setFailedTag(tag);
      });
    return () => {
      active = false;
    };
    // postings is read through tag, which changes exactly when the posting versions (or the retry count) do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, missing]);

  return {
    postings: resolved,
    status: !missing ? "ready" : failedTag === tag ? "error" : "loading",
    retry: () => setAttempt(a => a + 1),
  };
}
