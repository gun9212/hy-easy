import { createHash } from "node:crypto";
import type { Posting } from "./domain";

export function parseDeadline(raw: string): Posting["deadline"] {
  const dateMatch = raw.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!dateMatch) return { raw, at: null, date: null, precision: "unknown" };
  const [, y, m, d] = dateMatch;
  const date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const midnight = Date.parse(`${date}T00:00:00+09:00`);
  // Reject dates that JavaScript would silently roll into the next month.
  if (!Number.isFinite(midnight) || new Date(midnight + 9 * 3600_000).toISOString().slice(0, 10) !== date) return { raw, at: null, date: null, precision: "unknown" };
  const suffix = raw.slice((dateMatch.index ?? 0) + dateMatch[0].length);
  const time = suffix.match(/(?:\s|일|\(|^)(\d{1,2})\s*(?::|시)\s*(\d{1,2})?\s*분?/);
  if (!time) return { raw, at: null, date, precision: "date" };
  const hour = Number(time[1]), minute = Number(time[2] ?? 0);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return { raw, at: null, date, precision: "date" };
  const at = new Date(midnight + (hour * 60 + minute) * 60_000).toISOString();
  return { raw, at, date, precision: "minute" };
}

export function parseStipend(raw: string): Posting["stipend"] {
  const unit = /월/.test(raw) ? "month" : /시급|시간당/.test(raw) ? "hour" : /총액|총\s/.test(raw) ? "total" : "unknown";
  const match = raw.replaceAll(",", "").match(/(\d+(?:\.\d+)?)\s*(만)?\s*원/);
  // A range, minimum, or mixed allowance is not one confirmed comparable amount.
  const ambiguous = /[~∼〜]|이상|이하|별도|포함|내외|약\s/.test(raw) || (raw.match(/원/g)?.length ?? 0) > 1;
  const amount = match && !ambiguous ? Number(match[1]) * (match[2] ? 10_000 : 1) : null;
  return { raw, amount: amount !== null && Number.isFinite(amount) ? amount : null, unit };
}

export function stableHash(value: unknown) {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function classificationInput(posting: Pick<Posting, "practiceInfo" | "qualifications" | "tasks">) {
  return { practiceInfo: posting.practiceInfo, qualifications: posting.qualifications, tasks: posting.tasks };
}
export function sourceHash(posting: Posting) {
  const { id: _id, firstSeenAt: _first, updatedAt: _updated, lastCheckedAt: _checked, classification: _classification, classificationSource: _source, classificationStale: _stale, ...source } = posting;
  void [_id, _first, _updated, _checked, _classification, _source, _stale];
  return stableHash(source);
}
