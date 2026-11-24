"use client";
// The browser's copy of the posting list, kept in IndexedDB. Every call fails soft: when storage is blocked
// (private mode) or broken, the page simply loads the full list as if this were the first visit.
import type { Posting } from "@/lib/domain";
import { pickCachedPosting, POSTING_CACHE_VERSION } from "@/lib/posting-cache-fields";

const DB_NAME = "hy-easy";
const STORE = "cache";
const KEY = "postings";
const IDB_TIMEOUT_MS = 1_500;

export type StoredPostings = { syncedAt: string; lastCheckedAt: string | null; postings: Posting[] };
type Record = StoredPostings & { version: number };

function withTimeout<T>(promise: Promise<T>, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      onTimeout?.();
      reject(new Error("IndexedDB timed out"));
    }, IDB_TIMEOUT_MS);
    promise.then(
      value => {
        clearTimeout(id);
        resolve(value);
      },
      error => {
        clearTimeout(id);
        reject(error);
      },
    );
  });
}

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  let settled = false;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error("IndexedDB open blocked"));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      resolve(db);
    };
    request.onerror = () => {
      settled = true;
      reject(request.error);
    };
  });
  return withTimeout(opening, () => {
    settled = true;
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    let tx: IDBTransaction | null = null;
    const operation = new Promise<T>((resolve, reject) => {
      tx = db.transaction(STORE, mode);
      tx.onabort = () => reject(tx?.error ?? new Error("IndexedDB transaction aborted"));
      const request = action(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
    return await withTimeout(operation, () => {
      try {
        tx?.abort();
      } catch {
        // Transaction already finished or inactive.
      }
    });
  } finally {
    db.close();
  }
}

function isRecord(value: unknown): value is Record {
  const v = value as Partial<Record> | null;
  return Boolean(
    v && v.version === POSTING_CACHE_VERSION && typeof v.syncedAt === "string" && Array.isArray(v.postings),
  );
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
    const record: Record = {
      syncedAt: value.syncedAt,
      lastCheckedAt: value.lastCheckedAt,
      postings: value.postings.map(pickCachedPosting),
      version: POSTING_CACHE_VERSION,
    };
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
