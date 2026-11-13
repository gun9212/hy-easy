import type { Role } from "@lib/domain";
import type { ListPosting as Posting } from "@demo/lib/list-posting";

const DAY_MS = 86_400_000;
export const SOON_DAYS = 5;

/** "2026-11-13": the calendar date in Seoul (en-CA formats as YYYY-MM-DD). */
const seoulDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

/** Whole Seoul calendar days from `now` to the posting's deadline date, or null when the deadline is unknown. */
export function daysLeft(posting: Posting, now: string): number | null {
  if (!posting.deadline.date) return null;
  const end = Date.parse(`${posting.deadline.date}T00:00:00+09:00`);
  const start = Date.parse(`${seoulDate.format(new Date(now))}T00:00:00+09:00`);
  return Math.round((end - start) / DAY_MS);
}

/** Closed by the source, past the deadline time when it has one, or past the deadline date otherwise. */
export function isClosed(posting: Posting, now: string): boolean {
  if (posting.recruitment === "closed") return true;
  const { at, precision } = posting.deadline;
  if (precision === "minute" && at) return Date.parse(at) <= Date.parse(now);
  const days = daysLeft(posting, now);
  return days !== null && days < 0;
}

export function isSoon(posting: Posting, now: string): boolean {
  const days = daysLeft(posting, now);
  return !isClosed(posting, now) && days !== null && days <= SOON_DAYS;
}

export const DEADLINE_GROUPS = ["3일 안에 마감", "이번 주 마감", "다음 주 이후", "마감일 미정", "마감된 공고"] as const;
export type DeadlineGroup = (typeof DEADLINE_GROUPS)[number];

export function deadlineGroup(posting: Posting, now: string): DeadlineGroup {
  if (isClosed(posting, now)) return "마감된 공고";
  const days = daysLeft(posting, now);
  if (days === null) return "마감일 미정";
  if (days <= 3) return "3일 안에 마감";
  return days <= 7 ? "이번 주 마감" : "다음 주 이후";
}

export function deadlineLabel(posting: Posting, now: string): string {
  if (isClosed(posting, now)) return "마감";
  const days = daysLeft(posting, now);
  if (days === null) return "미정";
  return days === 0 ? "D-day" : `D-${days}`;
}

const SEOUL = "Asia/Seoul";
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SEOUL,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const stampFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SEOUL,
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "18:00" in Seoul time when the posting gives a time, else "". */
function deadlineTime(posting: Posting): string {
  const { at, date, precision } = posting.deadline;
  if (precision !== "minute" || !at) return "";
  const time = timeFormat.format(new Date(at));
  // "11-13 24시까지" is stored as 11-14 00:00; shown beside the 11-13 date it must read 24:00, not 00:00.
  return time === "00:00" && seoulDate.format(new Date(at)) !== date ? "24:00" : time;
}

/** "11.12 18:00" — the short deadline shown in table rows. */
export function deadlineShort(posting: Posting): string {
  const date = posting.deadline.date;
  if (!date) return "날짜 미기재";
  const [, m, d] = date.split("-");
  const time = deadlineTime(posting);
  return `${Number(m)}.${Number(d)}${time ? ` ${time}` : ""}`;
}

export function deadlineDetail(posting: Posting): string {
  const date = posting.deadline.date;
  if (!date) return posting.deadline.raw || "날짜 미기재";
  const time = deadlineTime(posting);
  return time ? `${date} ${time}` : date;
}

/** "11월 13일 10:55" — when the collector last checked any posting, or null without data. */
export function lastSyncLabel(postings: Posting[]): string | null {
  const latest = postings.reduce((max, p) => (p.lastCheckedAt > max ? p.lastCheckedAt : max), "");
  return latest ? stampFormat.format(new Date(latest)) : null;
}

/** "월 250만원", "시급 1만원" or the source's own text when the amount or unit is unknown. */
export function stipendParts(posting: Posting): { prefix: string; amount: string; suffix: string } | null {
  const { amount, unit } = posting.stipend;
  if (!amount || unit === "unknown") return null;
  const prefix = unit === "month" ? "월" : unit === "hour" ? "시급" : "총";
  const value = unit === "hour" ? amount.toLocaleString("ko-KR") : String(Math.round(amount / 10000));
  return { prefix, amount: value, suffix: unit === "hour" ? "원" : "만원" };
}

export function isNew(posting: Posting, now: string): boolean {
  return Date.parse(now) - Date.parse(posting.firstSeenAt) < DAY_MS;
}

export function competition(posting: Posting): string {
  if (!posting.applicants || !posting.headcount) return "-";
  return `${(posting.applicants / posting.headcount).toFixed(1)} : 1`;
}

export function roleOf(posting: Posting): Role | null {
  return posting.classification?.primaryRole ?? null;
}

export type Summary = { open: number; soon: number; fresh: number; avgStipend: number | null; next: Posting | null };

export function summarize(postings: Posting[], now: string): Summary {
  const open = postings.filter(p => !isClosed(p, now));
  const paid = open.flatMap(p => (p.stipend.unit === "month" && p.stipend.amount ? [p.stipend.amount] : []));
  const next = open
    .filter(p => p.deadline.date)
    .toSorted((a, b) => (a.deadline.date ?? "").localeCompare(b.deadline.date ?? ""))[0];
  return {
    open: open.length,
    soon: open.filter(p => isSoon(p, now)).length,
    fresh: postings.filter(p => isNew(p, now)).length,
    avgStipend: paid.length ? Math.round(paid.reduce((s, n) => s + n, 0) / paid.length / 10000) : null,
    next: next ?? null,
  };
}
