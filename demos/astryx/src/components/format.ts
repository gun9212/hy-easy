import type { Posting, Role } from "@lib/domain";

type BadgeColor = "blue" | "cyan" | "green" | "orange" | "pink" | "purple" | "red" | "teal" | "yellow";

const DAY_MS = 86_400_000;
const ROLE_COLORS: Partial<Record<Role, BadgeColor>> = {
  개발: "blue",
  "데이터·AI": "purple",
  "인프라·보안": "teal",
  기획: "cyan",
  디자인: "pink",
  마케팅: "orange",
  영업: "yellow",
  경영지원: "green",
  "재무·회계": "green",
  연구개발: "blue",
  "생산·품질": "teal",
};

export function roleColor(role: Role): BadgeColor {
  return ROLE_COLORS[role] ?? "cyan";
}

/** Whole days from `now` to the posting's deadline date, or null when the deadline is unknown. */
export function daysLeft(posting: Posting, now: string): number | null {
  if (!posting.deadline.date) return null;
  const end = Date.parse(`${posting.deadline.date}T00:00:00+09:00`);
  const start = Date.parse(now.slice(0, 10) + "T00:00:00+09:00");
  return Math.round((end - start) / DAY_MS);
}

export function deadlineLabel(posting: Posting, now: string): string {
  if (posting.recruitment === "closed") return "마감";
  const days = daysLeft(posting, now);
  if (days === null) return "미정";
  return days <= 0 ? "D-day" : `D-${days}`;
}

export function deadlineDetail(posting: Posting): string {
  const date = posting.deadline.date ?? "날짜 미기재";
  return posting.deadline.precision === "minute" ? `${date} 18:00` : date;
}

export function isNew(posting: Posting, now: string): boolean {
  return Date.parse(now) - Date.parse(posting.firstSeenAt) < DAY_MS;
}
