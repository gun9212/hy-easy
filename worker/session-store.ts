// Persists the operator's HY-WEP browser session (cookies only) between collector runs, so the collector
// reuses one login instead of signing in to the portal every five minutes.
// Cloud: a private GCS object (HYWEP_SESSION_BUCKET). Local: a 0600 file (HYWEP_STORAGE_STATE).
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GoogleAuth } from "google-auth-library";
import type { BrowserContext } from "playwright";

export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const GCS_TIMEOUT_MS = 15_000;
const DEFAULT_OBJECT = "hywep-state.json";
const DEFAULT_FILE = ".secrets/hywep-state.json";

type Location = { kind: "gcs"; bucket: string; object: string } | { kind: "file"; path: string };

export function sessionLocation(env: Readonly<Record<string, string | undefined>> = process.env): Location {
  const bucket = env.HYWEP_SESSION_BUCKET;
  if (bucket) return { kind: "gcs", bucket, object: env.HYWEP_SESSION_OBJECT || DEFAULT_OBJECT };
  return { kind: "file", path: env.HYWEP_STORAGE_STATE || DEFAULT_FILE };
}

function isStorageState(value: unknown): value is StorageState {
  return Boolean(value && typeof value === "object" && Array.isArray((value as StorageState).cookies));
}

async function gcsClient() {
  return new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/devstorage.read_write"] }).getClient();
}

/** Returns the stored session, or null when none exists yet (first run, or the object was deleted). */
export async function loadSession(location: Location): Promise<StorageState | null> {
  if (location.kind === "file") {
    const raw = await readFile(location.path, "utf8").catch(() => null);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isStorageState(parsed) ? parsed : null;
  }
  const client = await gcsClient();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(location.bucket)}/o/${encodeURIComponent(location.object)}?alt=media`;
  try {
    const response = await client.request({ url, timeout: GCS_TIMEOUT_MS });
    return isStorageState(response.data) ? response.data : null;
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404) return null;
    throw error;
  }
}

/** Saves the session after a fresh login. The content is never logged. */
export async function saveSession(location: Location, state: StorageState): Promise<void> {
  const body = JSON.stringify(state);
  if (location.kind === "file") {
    await mkdir(dirname(location.path), { recursive: true, mode: 0o700 });
    await writeFile(location.path, body, { mode: 0o600 });
    await chmod(location.path, 0o600);
    return;
  }
  const client = await gcsClient();
  await client.request({
    url: `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(location.bucket)}/o?uploadType=media&name=${encodeURIComponent(location.object)}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: body,
    timeout: GCS_TIMEOUT_MS,
  });
}
