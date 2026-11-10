// Decides, per list row, whether the detail page must be read again.
// The list already carries status, deadline, stipend and counts, so most rows need no detail fetch.
import { parseCount } from "../src/lib/normalize";
import { listRowHash, type ListRow } from "./hywep-fields";

/** Re-read details at least this often even when the list row is unchanged (catches detail-only edits). */
export const DETAIL_MAX_AGE_MS = 24 * 3600_000;

export type KnownPosting = { listHash: string | null; detailCheckedAt: string | null };
export type DetailReason = "new" | "list_changed" | "stale";
export type TouchItem = { source_id: string; applicants: number | null };
export type SyncPlan = {
  /** Rows whose detail page must be read, with the reason. */
  detail: { row: ListRow; reason: DetailReason }[];
  /** Unchanged rows: only the live applicant count and last-checked time are updated. */
  touch: TouchItem[];
};

function detailReason(row: ListRow, known: KnownPosting | undefined, now: number): DetailReason | null {
  if (!known) return "new";
  if (known.listHash !== listRowHash(row.fields)) return "list_changed";
  const checkedAt = known.detailCheckedAt ? Date.parse(known.detailCheckedAt) : NaN;
  if (!Number.isFinite(checkedAt) || now - checkedAt >= DETAIL_MAX_AGE_MS) return "stale";
  return null;
}

export function planListSync(
  rows: readonly ListRow[], known: ReadonlyMap<string, KnownPosting>, now = Date.now(),
): SyncPlan {
  const plan: SyncPlan = { detail: [], touch: [] };
  for (const row of rows) {
    const reason = detailReason(row, known.get(row.id), now);
    if (reason) plan.detail.push({ row, reason });
    else plan.touch.push({ source_id: row.id, applicants: parseCount(row.fields.applicants ?? "") });
  }
  return plan;
}
