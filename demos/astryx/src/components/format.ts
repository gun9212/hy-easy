import type { Posting, Role } from "@lib/domain";

const DAY_MS = 86_400_000;
export const SOON_DAYS = 5;

/** Whole days from `now` to the posting's deadline date, or null when the deadline is unknown. */
export function daysLeft(posting: Posting, now: string): number | null {
  if (!posting.deadline.date) return null;
  const end = Date.parse(`${posting.deadline.date}T00:00:00+09:00`);
  const start = Date.parse(now.slice(0, 10) + "T00:00:00+09:00");
  return Math.round((end - start) / DAY_MS);
}

export function isClosed(posting: Posting, now: string): boolean {
  const days = daysLeft(posting, now);
  return posting.recruitment === "closed" || (days !== null && days < 0);
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

/** "11.12 18:00" — the short deadline shown in table rows. */
export function deadlineShort(posting: Posting): string {
  const date = posting.deadline.date;
  if (!date) return "날짜 미기재";
  const [, m, d] = date.split("-");
  const time = posting.deadline.precision === "minute" ? " 18:00" : "";
  return `${Number(m)}.${Number(d)}${time}`;
}

export function deadlineDetail(posting: Posting): string {
  const date = posting.deadline.date ?? "날짜 미기재";
  return posting.deadline.precision === "minute" ? `${date} 18:00` : date;
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
