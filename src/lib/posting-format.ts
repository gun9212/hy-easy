import { eligibility, isNewPosting, postedAt, remainingDays, type ApplicationStatus, type Posting } from "./domain";

/** Days counted as "closing soon" (the summary card, the side-nav shortcut and the orange D-day badge). */
export const SOON_DAYS = 3;

/** Confirmed open posting whose deadline has not passed (excludes closed and recruitment-status-unknown rows). */
export function isOpenPosting(posting: Posting, now: Date): boolean {
  return posting.recruitment === "open" && eligibility(posting, [], now).status !== "closed";
}

/** Non-closed posting whose recruitment status could not be confirmed from the source text. */
export function isUnknownRecruitment(posting: Posting, now: Date): boolean {
  return posting.recruitment === "unknown" && eligibility(posting, [], now).status !== "closed";
}

/** Subtitle for the "모집 중" summary card, reflecting active-application blocking and unknown-status exclusions. */
export function openCardNote(stats: {
  unknown: number;
  activeCompany: string | null;
  hasActive: boolean;
  activeStatus?: ApplicationStatus | null;
}): string {
  if (stats.hasActive) {
    const company = stats.activeCompany;
    // Only a pending application frees up after HY-WEP's rejection; an accepted or unconfirmed one needs a check first.
    if (stats.activeStatus === "accepted")
      return company ? `${company} 합격 · 다음 지원은 지원팀 확인 필요` : "합격 상태 · 다음 지원은 지원팀 확인 필요";
    if (stats.activeStatus === "unknown")
      return company ? `${company} 지원 상태 확인 필요` : "진행 중 지원 상태 확인 필요";
    return company ? `${company} 지원 진행 중 · 탈락 처리 후 지원 가능` : "진행 중 지원으로 새 지원 제한 · 후보 탐색용";
  }
  return stats.unknown > 0
    ? `모집 확인 공고 · 상태 미확인 ${stats.unknown}건 제외`
    : "원문에서 모집 중으로 확인된 공고";
}

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
      .filter(p => isOpenPosting(p, now) && key(p) !== null)
      .sort((a, b) => Date.parse(key(a) ?? "") - Date.parse(key(b) ?? ""))[0] ?? null
  );
}

/** The side-nav shortcuts applied on top of the list filters. */
export function matchesWhen(posting: Posting, when: string | undefined, now: Date): boolean {
  if (when === "open") return isOpenPosting(posting, now);
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
  hourCycle: "h23",
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

const HYWEP_HOST = "hywep.hanyang.ac.kr";

/** Accepts only credential-free HTTPS URLs on HY-WEP so stored source links cannot redirect elsewhere. */
export function safeHywepUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.hostname !== HYWEP_HOST || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
