import { eligibility, isNewPosting, postedAt, remainingDays, type Posting } from "./domain";

/** Days counted as "closing soon" (the summary card, the side-nav shortcut and the orange D-day badge). */
export const SOON_DAYS = 3;

export function isClosingSoon(posting: Posting, now: Date): boolean {
  if (eligibility(posting, [], now).status === "closed") return false;
  const days = remainingDays(posting, now);
  return days !== null && days <= SOON_DAYS;
}

/** The open posting that closes first, or null. Ties keep the earliest deadline time. */
export function nextDeadline(postings: readonly Posting[], now: Date): Posting | null {
  const key = (p: Posting) => p.deadline.at ?? (p.deadline.date ? `${p.deadline.date}T23:59:59+09:00` : null);
  // filter() returns a new array, so sorting it leaves the caller's list alone.
  return (
    postings
      .filter(p => eligibility(p, [], now).status !== "closed" && key(p) !== null)
      .sort((a, b) => Date.parse(key(a) ?? "") - Date.parse(key(b) ?? ""))[0] ?? null
  );
}

/** The side-nav shortcuts applied on top of the list filters. */
export function matchesWhen(posting: Posting, when: string | undefined, now: Date): boolean {
  if (when === "open") return eligibility(posting, [], now).status !== "closed";
  if (when === "soon") return isClosingSoon(posting, now);
  if (when === "new") return isNewPosting(posting, now);
  return true;
}

/** "월 / 224 / 만원" for monthly pay, "시급 / 10,030 / 원" for hourly; null when the amount or unit is unknown. */
export function stipendParts(posting: Posting): { prefix: string; amount: string; suffix: string } | null {
  const { amount, unit } = posting.stipend;
  if (!amount || unit === "unknown") return null;
  if (unit === "hour") return { prefix: "시급", amount: amount.toLocaleString("ko-KR"), suffix: "원" };
  return {
    prefix: unit === "month" ? "월" : "총",
    amount: Math.round(amount / 10_000).toLocaleString("ko-KR"),
    suffix: "만원",
  };
}

/** "3.5 : 1" from applicants per opening, or "-" when either number is missing. */
export function competitionRatio(posting: Posting): string {
  if (posting.applicants === null || !posting.headcount) return "-";
  return `${(posting.applicants / posting.headcount).toFixed(1)} : 1`;
}

const seoulDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
const seoulTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * "11.13 18:00" for the list, as in the demo. A "24시까지" deadline is stored as the next day's 00:00; beside its own
 * date it reads "11.13 24:00", so it does not look like a time that has already passed.
 */
/** The registration date as "11.20" in KST, or null for postings that predate tracking (see postedAt). */
export function postedShort(posting: Posting): string | null {
  const posted = postedAt(posting);
  if (!posted) return null;
  const [, m, d] = seoulDate.format(new Date(posted)).split("-");
  return `${Number(m)}.${Number(d)}`;
}

export function deadlineShort(posting: Posting): string {
  const { at, date, precision, raw } = posting.deadline;
  if (!date) return raw || "마감 미기재";
  const [, m, d] = date.split("-");
  const day = `${Number(m)}.${Number(d)}`;
  if (precision !== "minute" || !at || !Number.isFinite(Date.parse(at))) return day;
  const time = seoulTime.format(new Date(at));
  return `${day} ${time === "00:00" && seoulDate.format(new Date(at)) !== date ? "24:00" : time}`;
}
