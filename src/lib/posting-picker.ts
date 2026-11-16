import { deadlineLabel, type Posting } from "./domain";

/** One line per posting, with the team and deadline so two postings of the same title can be told apart. */
export function postingOptionLabel(p: Posting): string {
  const team = p.department && p.department !== p.title ? ` (${p.department})` : "";
  return `${p.company} · ${p.title}${team} · 마감 ${deadlineLabel(p)}`;
}

/** The postings whose company, title or team hold every word of the query (case-insensitive). */
export function searchPostings<T extends Posting>(postings: readonly T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...postings];
  return postings.filter(p => {
    const text = `${p.company} ${p.title} ${p.department}`.toLowerCase();
    return words.every(w => text.includes(w));
  });
}
