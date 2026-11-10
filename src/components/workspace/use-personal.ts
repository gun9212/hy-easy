"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { APPLICATION_STATUSES, isBlocking, type Application, type ApplicationStatus } from "@/lib/domain";

export type Mode = "demo" | "live";
export type Personal = { favoriteIds: string[]; applications: Application[] };

const EMPTY: Personal = { favoriteIds: [], applications: [] };
const DEMO_STORAGE_KEY = "hy-easy-demo-v1";
const DEMO_CHANGE_EVENT = "hy-easy-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(DEMO_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DEMO_CHANGE_EVENT, onChange);
  };
}

function readDemoStorage(): string {
  try {
    return localStorage.getItem(DEMO_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function parsePersonal(raw: string): Personal {
  try {
    const parsed = JSON.parse(raw) as Partial<Personal>;
    return {
      favoriteIds: Array.isArray(parsed.favoriteIds) ? parsed.favoriteIds.filter(v => typeof v === "string") : [],
      applications: Array.isArray(parsed.applications)
        ? parsed.applications.filter(a => APPLICATION_STATUSES.includes(a.status))
        : [],
    };
  } catch {
    return EMPTY;
  }
}

async function postJson(path: string, method: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "저장하지 못했습니다.");
}

/**
 * Favorites and application records. Demo mode keeps them in localStorage;
 * live mode writes through the API first and updates local state only on success.
 */
export function usePersonal(mode: Mode, initial: Personal) {
  const raw = useSyncExternalStore(subscribe, readDemoStorage, () => "");
  const demo = useMemo(() => parsePersonal(raw), [raw]);
  const [live, setLive] = useState<Personal>(initial);
  const personal = mode === "demo" ? demo : live;

  function save(next: Personal): void {
    if (mode === "live") {
      setLive(next);
      return;
    }
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(DEMO_CHANGE_EVENT));
  }

  async function toggleFavorite(postingId: string): Promise<void> {
    const saved = personal.favoriteIds.includes(postingId);
    if (mode === "live") await postJson(`/api/favorites/${postingId}`, saved ? "DELETE" : "POST", {});
    const favoriteIds = saved
      ? personal.favoriteIds.filter(id => id !== postingId)
      : [...personal.favoriteIds, postingId];
    save({ ...personal, favoriteIds });
  }

  async function recordApplication(postingId: string, status: ApplicationStatus, confirmed: boolean): Promise<void> {
    if (status === "rejected" && !confirmed) throw new Error("HY-WEP 탈락 처리 완료 확인란을 선택해 주세요.");
    const otherActive = personal.applications.some(a => a.postingId !== postingId && isBlocking(a.status));
    if (otherActive && isBlocking(status))
      throw new Error("진행 중인 지원의 HY-WEP 탈락 처리 완료를 먼저 기록해 주세요.");
    if (mode === "live") await postJson("/api/applications", "POST", { postingId, status, confirmed });
    const existing = personal.applications.find(a => a.postingId === postingId);
    const updated: Application = {
      id: existing?.id ?? crypto.randomUUID(),
      postingId,
      status,
      updatedAt: new Date().toISOString(),
    };
    save({ ...personal, applications: [updated, ...personal.applications.filter(a => a.postingId !== postingId)] });
  }

  return { personal, toggleFavorite, recordApplication };
}
