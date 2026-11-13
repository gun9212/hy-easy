import { eligibility, remainingDays, type Posting } from "./domain";

export const DEADLINE_GROUPS = ["3일 안에 마감", "이번 주 마감", "다음 주 이후", "마감일 미정", "마감된 공고"] as const;
export type DeadlineGroup = (typeof DEADLINE_GROUPS)[number];

export const DEADLINE_GROUP_HINTS: Record<DeadlineGroup, string> = {
  "3일 안에 마감": "서류를 서둘러 마무리해야 하는 공고",
  "이번 주 마감": "이번 주 안에 지원을 끝낼 공고",
  "다음 주 이후": "여유 있게 준비할 수 있는 공고",
  "마감일 미정": "원문에 마감일이 없는 공고",
  "마감된 공고": "지원 기간이 끝난 공고",
};

/** Closed by the same rule the list uses (eligibility), otherwise by Seoul calendar days left. */
export function deadlineGroup(posting: Posting, now: Date): DeadlineGroup {
  if (eligibility(posting, [], now).status === "closed") return "마감된 공고";
  const days = remainingDays(posting, now);
  if (days === null) return "마감일 미정";
  if (days <= 3) return "3일 안에 마감";
  return days <= 7 ? "이번 주 마감" : "다음 주 이후";
}

/** Postings split into non-empty groups in DEADLINE_GROUPS order, keeping each group's incoming order. */
export function groupByDeadline(postings: readonly Posting[], now: Date): [DeadlineGroup, Posting[]][] {
  const byGroup = new Map<DeadlineGroup, Posting[]>(DEADLINE_GROUPS.map(g => [g, []]));
  postings.forEach(p => byGroup.get(deadlineGroup(p, now))?.push(p));
  return DEADLINE_GROUPS.flatMap(g => {
    const items = byGroup.get(g) ?? [];
    return items.length ? [[g, items] as [DeadlineGroup, Posting[]]] : [];
  });
}
