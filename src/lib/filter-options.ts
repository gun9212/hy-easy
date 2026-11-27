// Filter choices derived from the postings actually loaded, instead of hard-coded sample values.
import { isRole, type Filters, type Posting } from "./domain";

export type Option = readonly [value: string, label: string];

const REGION_ALIASES: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원도: "강원",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
};
const METROPOLITAN = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"]);
const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 30.4;
const PERIOD_DATES = /(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\D+(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/;
const STIPEND_STEPS = [1_500_000, 1_800_000, 2_000_000, 2_200_000, 2_500_000, 3_000_000] as const;

/** "서울특별시 강서구", "서울시 성동구" and "서울 영등포구" all map to "서울". Unknown first words are kept as-is. */
export function regionOf(location: string): string {
  const first = location.trim().split(/\s+/)[0] ?? "";
  if (REGION_ALIASES[first]) return REGION_ALIASES[first];
  // "서울시", "대전시" → "서울", "대전" (metropolitan cities written with a bare 시 suffix).
  const withoutSi = first.replace(/시$/, "");
  return METROPOLITAN.has(withoutSi) ? withoutSi : first;
}

/** "2026-12-23 ~ 2027-02-26" → 2 (months, rounded). Null when the period has no two full dates. */
export function periodMonths(period: string): number | null {
  const m = period.match(PERIOD_DATES);
  if (!m) return null;
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const end = Date.UTC(Number(m[4]), Number(m[5]) - 1, Number(m[6]));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(1, Math.round((end - start + DAY_MS) / DAY_MS / DAYS_PER_MONTH));
}

function countedOptions(values: readonly string[], label: (value: string) => string): Option[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, "ko"))
    .map(([value, count]) => [value, `${label(value)} (${count})`] as const);
}

export function termOptions(postings: readonly Posting[]): Option[] {
  return countedOptions(
    postings.map(p => p.term),
    term => term,
  );
}

export function regionOptions(postings: readonly Posting[]): Option[] {
  return countedOptions(
    postings.map(p => regionOf(p.location)),
    region => region,
  );
}

export function durationOptions(postings: readonly Posting[]): Option[] {
  const months = postings.map(p => periodMonths(p.period)).filter((m): m is number => m !== null);
  const counts = new Map<number, number>();
  for (const m of months) counts.set(m, (counts.get(m) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([m, count]) => [String(m), `${m}개월 (${count})`] as const);
}

/** Only thresholds that at least one confirmed monthly stipend reaches. */
export function stipendOptions(postings: readonly Posting[]): Option[] {
  const monthly = postings
    .filter(p => p.stipend.unit === "month" && p.stipend.amount !== null)
    .map(p => p.stipend.amount as number);
  return STIPEND_STEPS.filter(step => monthly.some(amount => amount >= step)).map(step => {
    const count = monthly.filter(amount => amount >= step).length;
    return [String(step), `월 ${step / 10_000}만원 이상 (${count})`] as const;
  });
}

/**
 * Drops selector filter values that are absent from the loaded postings' options so stale or hand-edited URLs
 * (?stipend=abc, ?duration=999, ?term=missing) never leave an invisible filter that zeroes out the list.
 */
export function sanitizeFiltersForPostings(filters: Filters, postings: readonly Posting[]): Filters {
  const next: Filters = { ...filters };
  if (next.role && !isRole(next.role)) delete next.role;
  if (postings.length === 0) return next;
  if (next.term && !termOptions(postings).some(([v]) => v === next.term)) delete next.term;
  if (next.location && !regionOptions(postings).some(([v]) => v === next.location)) delete next.location;
  if (next.duration && !durationOptions(postings).some(([v]) => v === next.duration)) delete next.duration;
  if (next.stipend && !stipendOptions(postings).some(([v]) => v === next.stipend)) delete next.stipend;
  return next;
}
