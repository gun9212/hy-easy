"use client";

import { useState, useSyncExternalStore } from "react";
import { isMajor, type Major } from "@/lib/majors";
import type { Mode } from "./use-personal";

const DEMO_MAJOR_KEY = "hy-easy-demo-major";
const DEMO_MAJOR_EVENT = "hy-easy-major-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(DEMO_MAJOR_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DEMO_MAJOR_EVENT, onChange);
  };
}

function readDemoMajor(): string {
  try {
    return localStorage.getItem(DEMO_MAJOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeDemoMajor(next: Major | null): void {
  try {
    if (next) localStorage.setItem(DEMO_MAJOR_KEY, next);
    else localStorage.removeItem(DEMO_MAJOR_KEY);
  } catch {
    // Storage can be blocked (private mode); the choice then lasts until reload.
  }
  window.dispatchEvent(new Event(DEMO_MAJOR_EVENT));
}

/** The student's major. Demo mode keeps it in localStorage; live mode saves it to the account first. */
export function useMajor(mode: Mode, initial: Major | null) {
  const demoRaw = useSyncExternalStore(subscribe, readDemoMajor, () => "");
  const [live, setLive] = useState<Major | null>(initial);
  const major = mode === "demo" ? (isMajor(demoRaw) ? demoRaw : null) : live;

  async function chooseMajor(next: Major | null): Promise<void> {
    if (mode === "demo") return writeDemoMajor(next);
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ major: next }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(data.error || "전공을 저장하지 못했습니다.");
    setLive(next);
  }

  return { major, chooseMajor };
}
