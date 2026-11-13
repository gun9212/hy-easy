import { z } from "zod";
import { periodMonths, regionOf } from "./filter-options";
import { neighborMajors, SEOUL_MAJORS, type Major } from "./majors";

export const ROLES = [
  "개발",
  "데이터·AI",
  "인프라·보안",
  "기획",
  "디자인",
  "마케팅",
  "영업",
  "경영지원",
  "재무·회계",
  "연구개발",
  "생산·품질",
  "기타",
] as const;
export type Role = (typeof ROLES)[number];
export const APPLICATION_STATUSES = ["in_progress", "rejection_pending", "rejected", "accepted", "unknown"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  in_progress: "지원 진행 중",
  rejection_pending: "탈락 통보 · 처리 대기",
  rejected: "HY-WEP 탈락 처리 완료",
  accepted: "합격",
  unknown: "상태 확인 필요",
};
export const MAJOR_REQUIREMENTS = ["any", "listed", "unknown"] as const;
const majorList = (max: number) => z.array(z.enum(SEOUL_MAJORS)).max(max);
/** Which Seoul-campus majors a posting asks for, prefers, and whose coursework fits its tasks. */
export const majorsSchema = z
  .object({
    requirement: z.enum(MAJOR_REQUIREMENTS),
    required: majorList(30),
    preferred: majorList(12),
    related: majorList(5),
  })
  .strict();
export type PostingMajors = z.infer<typeof majorsSchema>;
export const classificationSchema = z
  .object({
    primaryRole: z.enum(ROLES),
    secondaryRoles: z.array(z.enum(ROLES)).max(2),
    summary: z.string().min(1).max(500),
    evidence: z
      .array(
        z.object({ field: z.enum(["practiceInfo", "qualifications", "tasks"]), quote: z.string().min(1).max(400) }),
      )
      .min(1)
      .max(5),
    needsReview: z.boolean(),
    // Optional so classifications stored before majors existed still parse.
    majors: majorsSchema.optional(),
  })
  .strict();
export type Classification = z.infer<typeof classificationSchema>;
/** What the model must return: the same shape with majors required. */
export const classificationOutputSchema = classificationSchema.extend({ majors: majorsSchema });

export type MajorFit = "required" | "preferred" | "adjacent" | "related" | "other" | "none";
export const MAJOR_FIT_LABELS: Record<Exclude<MajorFit, "none">, string> = {
  required: "내 전공 지원 대상",
  preferred: "내 전공 우대",
  adjacent: "비슷한 전공 대상",
  related: "내 전공 관련 업무",
  other: "다른 전공 대상",
};
/** How a student's major fits a posting. "none" means nothing to say (no major chosen or no data). */
export function majorFit(posting: Posting, major: Major | null): MajorFit {
  const m = posting.classification?.majors;
  if (!major || !m) return "none";
  if (m.requirement === "listed" && m.required.includes(major)) return "required";
  if (m.preferred.includes(major)) return "preferred";
  // Restricted to majors in the student's field (e.g. 컴퓨터소프트웨어학부 for 정보공학전공): often open as 관련 전공.
  if (m.requirement === "listed") return neighborMajors(major).some(n => m.required.includes(n)) ? "adjacent" : "other";
  return m.related.includes(major) ? "related" : "none";
}
export type ClassificationInput = { practiceInfo: string; qualifications: string; tasks: string };
export type Posting = {
  id: string;
  sourceId: string;
  sourceUrl: string;
  company: string;
  department: string;
  title: string;
  term: string;
  location: string;
  period: string;
  headcount: number | null;
  /** Live applicant count from the HY-WEP list. Excluded from change history. */
  applicants: number | null;
  programType: string;
  majors: string;
  stipend: { amount: number | null; unit: "month" | "hour" | "total" | "unknown"; raw: string };
  deadline: { raw: string; at: string | null; date: string | null; precision: "minute" | "date" | "unknown" };
  recruitment: "open" | "closed" | "unknown";
  practiceInfo: string;
  qualifications: string;
  tasks: string;
  benefits: string;
  events: { label: string; raw: string }[];
  firstSeenAt: string;
  updatedAt: string;
  lastCheckedAt: string;
  /** Latest change to the source text or classification (from posting_view); browsers sync from it. */
  changedAt?: string;
  classification: Classification | null;
  classificationSource: "ai" | "admin" | "sample" | null;
  classificationStale: boolean;
};
export type Application = { id: string; postingId: string; status: ApplicationStatus; updatedAt: string };
export type Decision = { status: "available" | "blocked" | "closed" | "unknown"; label: string; reason: string };

export function isBlocking(status: ApplicationStatus) {
  return status !== "rejected";
}

export function eligibility(posting: Posting, applications: Application[], now = new Date()): Decision {
  if (posting.recruitment === "closed")
    return { status: "closed", label: "모집 마감", reason: "원문에서 모집 마감이 확인되었습니다." };
  const deadline = posting.deadline;
  if (deadline.at && Date.parse(deadline.at) <= now.getTime())
    return { status: "closed", label: "모집 마감", reason: "지원 마감 시각이 지났습니다." };
  const today = kstDate(now);
  if (deadline.precision === "date" && deadline.date && deadline.date < today)
    return { status: "closed", label: "모집 마감", reason: "마감일이 지났습니다. 원문의 마감 시각은 미기재입니다." };
  const active = applications.find(a => isBlocking(a.status));
  if (active)
    return {
      status: active.status === "unknown" ? "unknown" : "blocked",
      label: active.status === "unknown" ? "확인 필요" : "진행 중 지원으로 제한",
      reason:
        active.status === "rejection_pending"
          ? "탈락 통보를 받았더라도 HY-WEP의 탈락 처리 완료를 확인해야 다음 지원이 가능합니다."
          : active.status === "accepted"
            ? "합격 상태입니다. 다음 지원 가능 여부는 현장실습지원팀에 확인해야 합니다."
            : active.status === "unknown"
              ? "진행 중인 지원 상태를 먼저 확인해 주세요."
              : "HY-WEP에서 진행 중인 지원이 있습니다. 해당 지원의 탈락 처리가 완료되어야 다음 지원이 가능합니다.",
    };
  if (
    posting.recruitment === "unknown" ||
    deadline.precision !== "minute" ||
    !deadline.at ||
    !Number.isFinite(Date.parse(deadline.at))
  )
    return {
      status: "unknown",
      label: "확인 필요",
      reason: "정확한 마감 시각 또는 모집 상태가 확인되지 않았습니다. 원문을 확인해 주세요.",
    };
  return {
    status: "available",
    label: "일정상 지원 가능",
    reason: "진행 중인 지원이 없고 마감 전입니다. 학과·학년 등 지원 자격과 HY-WEP의 현재 상태는 별도로 확인해 주세요.",
  };
}

export function simulate(posting: Posting, releaseAt: string, now = new Date()): Decision {
  const at = new Date(releaseAt);
  if (!releaseAt || !Number.isFinite(at.getTime()) || at < now)
    return {
      status: "unknown",
      label: "가정 시각 확인 필요",
      reason: "현재 이후의 HY-WEP 탈락 처리 완료 예상 시각을 입력해 주세요.",
    };
  const result = eligibility(posting, [], at);
  if (result.status === "available")
    return {
      ...result,
      label: "조건부 지원 가능",
      reason:
        "가정한 시각까지 이전 지원의 HY-WEP 탈락 처리가 완료되고, 이 공고가 조기 마감되지 않는 경우 지원할 수 있습니다.",
    };
  return result;
}

/** NEW badge: first seen by the collector on the same KST calendar day as `now`. */
export function isNewPosting(posting: Posting, now = new Date()) {
  const firstSeen = new Date(posting.firstSeenAt);
  return Number.isFinite(firstSeen.getTime()) && kstDate(firstSeen) === kstDate(now);
}
export function kstDate(date: Date) {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
export function formatDate(value: string | null, time = false) {
  if (!value) return "확인 필요";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}
export function stipendLabel(posting: Posting) {
  return posting.stipend.raw || "미기재";
}
export function deadlineLabel(posting: Posting) {
  return posting.deadline.precision === "minute"
    ? formatDate(posting.deadline.at, true)
    : posting.deadline.raw || "마감 미기재";
}
export function remainingDays(posting: Posting, now = new Date()) {
  if (!posting.deadline.date) return null;
  return Math.ceil(
    (Date.parse(posting.deadline.date + "T00:00:00+09:00") - Date.parse(kstDate(now) + "T00:00:00+09:00")) / 86400_000,
  );
}
/** A quote must carry at least this many visible characters to count as evidence. */
const MIN_QUOTE_CHARS = 4;
export function assertEvidence(input: ClassificationInput, result: Classification): Classification {
  if (
    result.secondaryRoles.includes(result.primaryRole) ||
    new Set(result.secondaryRoles).size !== result.secondaryRoles.length
  )
    throw new Error("직군이 중복되었습니다.");
  for (const e of result.evidence) {
    const quote = collapseWhitespace(e.quote);
    if (quote.length < MIN_QUOTE_CHARS || !collapseWhitespace(input[e.field]).includes(quote))
      throw new Error("원문에서 분류 근거를 찾을 수 없습니다.");
  }
  return result;
}

/**
 * Quotes are compared ignoring all whitespace and invisible control/format characters. HY-WEP text has stray
 * ones (U+009F, "비교 /분석") that models drop or normalise when quoting. Visible characters must match in order.
 */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, "").replace(/[\p{Cc}\p{Cf}]/gu, "");
}

export type Filters = {
  q?: string;
  role?: string;
  term?: string;
  location?: string;
  duration?: string;
  stipend?: string;
  sort?: string;
  closed?: string;
  saved?: string;
  mine?: string;
  /** "true": keep postings restricted to other majors when a major is chosen (hidden by default). */
  others?: string;
  page?: string;
};
const MINE_FITS: MajorFit[] = ["required", "preferred", "adjacent", "related"];
export function filterPostings(
  postings: Posting[],
  filters: Filters,
  favoriteIds: string[] = [],
  now = new Date(),
  major: Major | null = null,
) {
  const query = (filters.q ?? "").toLocaleLowerCase().trim();
  const rows = postings.filter(p => {
    const role = p.classification;
    return (
      (!query ||
        [p.company, p.title, p.department, p.tasks, p.qualifications].join(" ").toLowerCase().includes(query)) &&
      (!filters.role || role?.primaryRole === filters.role || role?.secondaryRoles.includes(filters.role as Role)) &&
      (!filters.term || p.term === filters.term) &&
      (!filters.location || regionOf(p.location) === filters.location) &&
      (!filters.duration || String(periodMonths(p.period)) === filters.duration) &&
      (!filters.stipend ||
        (p.stipend.unit === "month" && p.stipend.amount !== null && p.stipend.amount >= Number(filters.stipend))) &&
      (filters.closed === "true" || eligibility(p, [], now).status !== "closed") &&
      (filters.saved !== "true" || favoriteIds.includes(p.id)) &&
      (!major || filters.others === "true" || majorFit(p, major) !== "other") &&
      (filters.mine !== "true" || !major || MINE_FITS.includes(majorFit(p, major)))
    );
  });
  return rows.sort((a, b) => {
    if (filters.sort === "deadline")
      return deadlineSortKey(a) - deadlineSortKey(b) || b.firstSeenAt.localeCompare(a.firstSeenAt);
    if (filters.sort === "stipend") return monthly(b) - monthly(a) || b.firstSeenAt.localeCompare(a.firstSeenAt);
    return b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id);
  });
}
function monthly(p: Posting) {
  return p.stipend.unit === "month" && p.stipend.amount !== null ? p.stipend.amount : -1;
}
function deadlineSortKey(p: Posting) {
  return p.deadline.at
    ? Date.parse(p.deadline.at)
    : p.deadline.date
      ? Date.parse(p.deadline.date + "T23:59:59+09:00")
      : Infinity;
}
