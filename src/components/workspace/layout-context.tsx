"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

/** Below this width (where AppShell folds its side nav) postings show as cards instead of a table. */
const NARROW_QUERY = "(width < 768px)";

const InitialNarrow = createContext(false);

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The server guesses phone or not from the request (isPhoneRequest in src/lib/device.ts); the client then
 * follows the real viewport. Hydration reads the server's guess, so the first client render matches the HTML.
 */
export function LayoutProvider({ initialNarrow, children }: { initialNarrow: boolean; children: React.ReactNode }) {
  return <InitialNarrow.Provider value={initialNarrow}>{children}</InitialNarrow.Provider>;
}

export function useIsNarrow(): boolean {
  const initial = useContext(InitialNarrow);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => initial,
  );
}
