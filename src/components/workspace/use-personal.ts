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

async function requestJson(
  path: string,
  method: string,
  body?: unknown,
  fallback = "저장하지 못했습니다.",
): Promise<void> {
  const response = await fetch(
    path,
    body === undefined
      ? { method }
      : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || fallback);
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

  function update(transform: (prev: Personal) => Personal): void {
    if (mode === "live") {
      setLive(transform);
      return;
    }
    const next = transform(parsePersonal(readDemoStorage()));
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
    window.dispatchEvent(new Event(DEMO_CHANGE_EVENT));
  }

  async function toggleFavorite(postingId: string): Promise<void> {
    const saved = personal.favoriteIds.includes(postingId);
    if (mode === "live") await requestJson(`/api/favorites/${postingId}`, saved ? "DELETE" : "POST");
    update(prev => {
      const favoriteIds = saved
        ? prev.favoriteIds.filter(id => id !== postingId)
        : prev.favoriteIds.includes(postingId)
          ? prev.favoriteIds
          : [...prev.favoriteIds, postingId];
      return { ...prev, favoriteIds };
    });
  }

  async function recordApplication(postingId: string, status: ApplicationStatus, confirmed: boolean): Promise<void> {
    if (status === "rejected" && !confirmed) throw new Error("HY-WEP 탈락 처리 완료 확인란을 선택해 주세요.");
    const otherActive = personal.applications.some(a => a.postingId !== postingId && isBlocking(a.status));
    if (otherActive && isBlocking(status))
      throw new Error("진행 중인 지원의 HY-WEP 탈락 처리 완료를 먼저 기록해 주세요.");
    if (mode === "live") await requestJson("/api/applications", "POST", { postingId, status, confirmed });
    update(prev => {
      const existing = prev.applications.find(a => a.postingId === postingId);
      const updated: Application = {
        id: existing?.id ?? crypto.randomUUID(),
        postingId,
        status,
        updatedAt: new Date().toISOString(),
      };
      return { ...prev, applications: [updated, ...prev.applications.filter(a => a.postingId !== postingId)] };
    });
  }

  async function deleteApplication(postingId: string): Promise<void> {
    if (mode === "live")
      await requestJson(`/api/applications/${postingId}`, "DELETE", undefined, "삭제하지 못했습니다.");
    update(prev => ({ ...prev, applications: prev.applications.filter(a => a.postingId !== postingId) }));
  }

  return { personal, toggleFavorite, recordApplication, deleteApplication };
}
