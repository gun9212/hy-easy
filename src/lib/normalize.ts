import { createHash } from "node:crypto";
import type { Posting } from "./domain";

type Deadline = Posting["deadline"];
type Stipend = Posting["stipend"];

const KST_OFFSET_MS = 9 * 3600_000;
const MINUTE_MS = 60_000;
const DATE_PATTERN = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/;
// "18:00", "18시", "18시 30분", "24시까지". Must follow whitespace, "일", "(" or the start.
const TIME_PATTERN = /(?:\s|일|\(|^)(\d{1,2})\s*(?::|시)\s*(\d{1,2})?\s*분?/;
// A range, minimum, or mixed allowance is not one confirmed comparable amount.
const AMBIGUOUS_STIPEND = /[~∼〜]|이상|이하|별도|포함|내외|약\s/;
const STIPEND_NUMBER = /(\d+(?:\.\d+)?)\s*(만)?/g;
const INSTITUTION_BADGES = /\s*(신규모집|추가모집|재모집)\s*$/;
const INSTITUTION_SEPARATOR = /\s+\/\s+/;

function unknownDeadline(raw: string): Deadline {
  return { raw, at: null, date: null, precision: "unknown" };
}

function isoDate(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Rejects dates JavaScript would silently roll over (e.g. 02-30 → 03-02). */
function kstMidnight(date: string): number | null {
  const midnight = Date.parse(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(midnight)) return null;
  const roundTrip = new Date(midnight + KST_OFFSET_MS).toISOString().slice(0, 10);
  return roundTrip === date ? midnight : null;
}

function parseTime(text: string): { hour: number; minute: number } | null {
  const match = text.match(TIME_PATTERN);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return { hour, minute };
}

/** Parses a KST deadline. `24:00` becomes the next day's 00:00. */
export function parseDeadline(raw: string): Deadline {
  const dateMatch = raw.match(DATE_PATTERN);
  if (!dateMatch) return unknownDeadline(raw);
  const [, year, month, day] = dateMatch;
  const date = isoDate(year, month, day);
  const midnight = kstMidnight(date);
  if (midnight === null) return unknownDeadline(raw);

  const suffix = raw.slice((dateMatch.index ?? 0) + dateMatch[0].length);
  const time = parseTime(suffix);
  if (!time) return { raw, at: null, date, precision: "date" };

  const at = new Date(midnight + (time.hour * 60 + time.minute) * MINUTE_MS).toISOString();
  return { raw, at, date, precision: "minute" };
}

/** HY-WEP lists the deadline date and time in separate columns ("2026-10-26", "24시까지"). */
export function combineDeadline(date: string, time: string): Deadline {
  const raw = [date, time]
    .map(value => value.trim())
    .filter(Boolean)
    .join(" ");
  return parseDeadline(raw);
}

function stipendUnit(text: string): Stipend["unit"] {
  if (/월/.test(text)) return "month";
  if (/시급|시간당/.test(text)) return "hour";
  if (/총액|총\s/.test(text)) return "total";
  return "unknown";
}

function stipendAmount(text: string): number | null {
  if (AMBIGUOUS_STIPEND.test(text) || (text.match(/원/g)?.length ?? 0) > 1) return null;
  const numbers = [...text.replaceAll(",", "").matchAll(STIPEND_NUMBER)];
  if (numbers.length !== 1) return null;
  const [, value, tenThousand] = numbers[0];
  const amount = Number(value) * (tenThousand ? 10_000 : 1);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Accepts "월 220만원", "월 1,620,000 원" and the list format "월/1,620,000". */
export function parseStipend(raw: string): Stipend {
  const text = raw.trim();
  return { raw: text, amount: stipendAmount(text), unit: stipendUnit(text) };
}

/** "2", "2 명", "2명" → 2. Anything else is not a confirmed count. */
export function parseCount(raw: string): number | null {
  const match = raw.trim().match(/^(\d+)\s*명?$/);
  return match ? Number(match[1]) : null;
}

export type SelectionInfo = { headcount: number | null; grade: string; deadline: Deadline };

function valueAfterColon(part: string | undefined): string {
  return part?.split(/[:：]/).slice(1).join(":").trim() ?? "";
}

/** "2 명 / 학년무관 / 접수마감 : 2026-10-26 / 시간 : 24시까지" */
export function parseSelectionInfo(raw: string): SelectionInfo {
  const parts = raw
    .split("/")
    .map(part => part.trim())
    .filter(Boolean);
  const countPart = parts.find(part => /^\d+\s*명$/.test(part));
  const datePart = parts.find(part => part.startsWith("접수마감"));
  const timePart = parts.find(part => part.startsWith("시간"));
  const grade = parts.find(part => part !== countPart && !/[:：]/.test(part)) ?? "";
  const deadline = datePart
    ? combineDeadline(valueAfterColon(datePart), valueAfterColon(timePart))
    : unknownDeadline(raw);
  return { headcount: countPart ? parseCount(countPart) : null, grade, deadline };
}

/** Detail cell "기관명 / 부서명 신규모집". Company names may contain an unspaced "/". */
export function splitInstitution(raw: string): { company: string; department: string } {
  const text = raw.replace(INSTITUTION_BADGES, "").trim();
  const parts = text.split(INSTITUTION_SEPARATOR);
  if (parts.length < 2) return { company: text, department: "" };
  const department = parts.at(-1) ?? "";
  return { company: parts.slice(0, -1).join(" / "), department };
}

export function stableHash(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") {
      const entries = Object.entries(v).sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entries.map(([key, inner]) => [key, canonical(inner)]));
    }
    return v;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function classificationInput(posting: Pick<Posting, "practiceInfo" | "qualifications" | "tasks">) {
  return { practiceInfo: posting.practiceInfo, qualifications: posting.qualifications, tasks: posting.tasks };
}

/** Content hash for change history. Volatile fields (timestamps, live applicant count) are excluded. */
export function sourceHash(posting: Posting): string {
  const {
    id: _id,
    firstSeenAt: _first,
    updatedAt: _updated,
    lastCheckedAt: _checked,
    applicants: _applicants,
    classification: _classification,
    classificationSource: _source,
    classificationStale: _stale,
    ...source
  } = posting;
  void [_id, _first, _updated, _checked, _applicants, _classification, _source, _stale];
  return stableHash(source);
}
