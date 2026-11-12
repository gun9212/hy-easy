"use client";
// The browser's copy of the posting list, kept in IndexedDB. Every call fails soft: when storage is blocked
// (private mode) or broken, the page simply loads the full list as if this were the first visit.
import type { Posting } from "@/lib/domain";

/** Bump when the Posting shape changes so copies saved by an older build are dropped. */
const CACHE_VERSION = 1;
const DB_NAME = "hy-easy";
const STORE = "cache";
const KEY = "postings";

export type StoredPostings = { syncedAt: string; lastCheckedAt: string | null; postings: Posting[] };
type Record = StoredPostings & { version: number };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function isRecord(value: unknown): value is Record {
  const v = value as Partial<Record> | null;
  return Boolean(v && v.version === CACHE_VERSION && typeof v.syncedAt === "string" && Array.isArray(v.postings));
}

export async function readStoredPostings(): Promise<StoredPostings | null> {
  try {
    const value = await run<unknown>("readonly", store => store.get(KEY));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export async function writeStoredPostings(value: StoredPostings): Promise<void> {
  try {
    const record: Record = { ...value, version: CACHE_VERSION };
    await run("readwrite", store => store.put(record, KEY));
  } catch {
    // Not saved: the next visit loads the full list again.
  }
}

export async function clearStoredPostings(): Promise<void> {
  try {
    await run("readwrite", store => store.delete(KEY));
  } catch {
    // Nothing stored or storage blocked.
  }
}
