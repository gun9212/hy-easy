"use client";

import { useEffect } from "react";
import { clearStoredPostings } from "./workspace/posting-store";

/** Drops any cached postings left in IndexedDB when school eligibility has been denied. */
export function ClearPostingCache() {
  useEffect(() => {
    void clearStoredPostings();
  }, []);
  return null;
}
