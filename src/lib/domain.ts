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
  "금융·보험",
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
const evidenceSchema = z.object({
  field: z.enum(["practiceInfo", "qualifications", "tasks", "attachment"]),
  quote: z.string().min(1).max(400),
});
export const classificationSchema = z
  .object({
    primaryRole: z.enum(ROLES),
    secondaryRoles: z.array(z.enum(ROLES)).max(2),
    summary: z.string().min(1).max(500),
    evidence: z.array(evidenceSchema).min(1).max(5),
    needsReview: z.boolean(),
    // Optional so classifications stored before majors existed still parse.
    majors: majorsSchema.optional(),
  })
  .strict();
export type Classification = z.infer<typeof classificationSchema>;
/** Most secondary-role quotes the model may give; at most two roles survive verifySecondaryRoles. */
export const MAX_SECONDARY_EVIDENCE = 4;
/**
 * What the model must return: the stored shape with majors required, plus secondaryEvidence, a quote for each
 * secondary role from the posting sentence where the student does that role's work. verifySecondaryRoles keeps only
 * the roles whose quote checks out and drops secondaryEvidence.
 * The field is last and the system prompt does not mention it on purpose. Making secondaryRoles a list of quoted
 * claims, or adding a prompt rule on secondary quotes, made Haiku leave out correct roles (삼성생명 영업 0/4,
 * 2026-11-20); a JSON-schema description on the field made it add wrong ones.
 */
export const classificationOutputSchema = z
  .object({
    primaryRole: classificationSchema.shape.primaryRole,
    secondaryRoles: classificationSchema.shape.secondaryRoles,
    summary: classificationSchema.shape.summary,
    evidence: classificationSchema.shape.evidence,
    needsReview: classificationSchema.shape.needsReview,
    majors: majorsSchema,
    secondaryEvidence: z
      .array(
        z
          .object({ role: z.enum(ROLES), quote: evidenceSchema.shape.quote, field: evidenceSchema.shape.field })
          .strict(),
      )
      .max(MAX_SECONDARY_EVIDENCE),
  })
  .strict();
export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;

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
/**
 * What the classifier reads. attachment/department are present only for postings whose tasks just point to an
 * attached file (see worker/attachments.ts); other postings keep the three-field shape and their hashes.
 */
export type ClassificationInput = {
  practiceInfo: string;
  qualifications: string;
  tasks: string;
  attachment?: string;
  department?: string;
};
/** Text pulled out of the posting's attached PDF with a plain PDF reader (no AI). The file itself is not kept. */
export type PostingAttachment = {
  fileName: string;
  /** sha256 of the downloaded file. */
  fileHash: string;
  pages: number;
  text: string;
  truncated: boolean;
  extractedAt: string;
};
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
  /** Only for postings whose tasks say "see the attached file" and whose attachment is a readable PDF. */
  attachment?: PostingAttachment;
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

/** How many weekdays (KST) a posting stays "new": today and the two before it, so a Monday still shows Thu–Fri. */
export const NEW_BUSINESS_DAYS = 3;
const DAY_MS = 86_400_000;

/** The first KST date of the "new" window: the earliest of the last NEW_BUSINESS_DAYS weekdays up to `now`. */
export function newWindowStart(now = new Date()): string {
  let day = new Date(`${kstDate(now)}T00:00:00Z`);
  let weekdays = 0;
  for (;;) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) weekdays++;
    if (weekdays === NEW_BUSINESS_DAYS) return day.toISOString().slice(0, 10);
    day = new Date(day.getTime() - DAY_MS);
  }
}

/** 신규 badge and the "새로 올라온 공고" view: first seen by the collector within the last three KST business days. */
export function isNewPosting(posting: Posting, now = new Date()) {
  const firstSeen = new Date(posting.firstSeenAt);
  return Number.isFinite(firstSeen.getTime()) && kstDate(firstSeen) >= newWindowStart(now);
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
type EvidenceField = Classification["evidence"][number]["field"];
const EVIDENCE_FIELDS: EvidenceField[] = ["practiceInfo", "qualifications", "tasks", "attachment"];
/**
 * Every quote must appear verbatim in the posting. Models sometimes quote the right sentence but name the wrong
 * field (job duties written under 자격사항, cited as tasks), so a quote found in another field is accepted and its
 * field corrected to where it actually is.
 */
export function assertEvidence(input: ClassificationInput, result: Classification): Classification {
  if (
    result.secondaryRoles.includes(result.primaryRole) ||
    new Set(result.secondaryRoles).size !== result.secondaryRoles.length
  )
    throw new Error("직군이 중복되었습니다.");
  const evidence = result.evidence.map(e => {
    const quote = collapseWhitespace(e.quote);
    const contains = (field: EvidenceField) => collapseWhitespace(input[field] ?? "").includes(quote);
    const field = contains(e.field) ? e.field : EVIDENCE_FIELDS.find(contains);
    if (quote.length < MIN_QUOTE_CHARS || !field) throw new Error("원문에서 분류 근거를 찾을 수 없습니다.");
    return field === e.field ? e : { ...e, field };
  });
  return { ...result, evidence };
}

/** A secondary role needs a longer quote than the primary role: a bare "SQL" or "데이터 분석" is not a task. */
export const MIN_SECONDARY_QUOTE_CHARS = 8;
/**
 * Sentences that are not work the student does: a skill or experience the posting asks for ("SQL 가능한 학생",
 * "분석해 본 경험", "Python 우대") or something the student only learns ("M&A 절차를 실습을 통해 습득합니다").
 * The field alone cannot tell: some postings describe the job itself under 자격사항
 * (삼성생명 "포트폴리오 영업 업무를 주로 합니다"), so quotes from any field are checked this way instead.
 */
const NOT_TASK_QUOTE =
  /가능한(분|자|학생|사람)|가능자|우대|선호|수강자|경험자|본경험|한경험|능숙|다룰수있|할수있는(분|자|학생)|습득|배우|배웁|익히|익힙/;
/**
 * Role-specific checks on a secondary quote (matched against the quote with whitespace removed). Haiku keeps adding
 * roles from sentences the prompt says do not count, so the prompt's role definitions are enforced here too.
 * - 데이터·AI: the quote must name model, pipeline, crawler, dashboard, Python/R/SQL or statistics work, and must not
 *   be about monitoring or looking up metrics, controlling equipment, fixing research code, or making content.
 * - 디자인: not when the images or video come from generative AI.
 * - 재무·회계, 연구개발: the quote must name that role's own work (money, accounts and IR; experiments, design and
 *   testing), not a sales report or market research that only sounds like it.
 */
const SECONDARY_QUOTE_RULES: Partial<Record<Role, { requires?: RegExp; excludes?: RegExp }>> = {
  "데이터·AI": {
    requires:
      /머신러닝|딥러닝|강화학습|인공지능|모델(을|의)?(학습|개발|훈련|구축)|파인튜닝|파이프라인|크롤|스크래핑|대시보드|통계|SQL|Python|파이썬|(^|[^a-z])R([^a-z&]|$)|챗봇|데이터(를)?(수집|가공|처리|구조화|연동)|machinelearning|deeplearning|pipeline|crawl|dashboard/i,
    excludes: /모니터링|조회|제어|코딩개선|코드개선|영상|이미지|콘텐츠/,
  },
  디자인: { excludes: /생성형|AI(를|로)|AI기반|AI활용/i },
  "재무·회계": {
    requires:
      /재무|회계|결산|세금|세무|급여|정산|결제|예산|비용|자금|증빙|전표|손익|P&L|가치평가|valuation|공시|IR|투자자|settlement/i,
  },
  연구개발: { requires: /실험|연구|시뮬레이션|설계|시제품|측정|시험|소재|공정|논문|검수|기술기준/ },
};

/**
 * Keeps a secondary role only when one of its secondaryEvidence quotes is found verbatim in the posting, is not a
 * skill requirement or something learned (NOT_TASK_QUOTE), and passes that role's SECONDARY_QUOTE_RULES. Unsupported roles are dropped silently (the
 * list may end up empty, which is normal); the primary-role evidence is still checked strictly by assertEvidence.
 * Returns the stored shape with at most two roles.
 */
export function verifySecondaryRoles(input: ClassificationInput, output: ClassificationOutput): Classification {
  const supported = (role: Role) =>
    output.secondaryEvidence.some(claim => {
      if (claim.role !== role) return false;
      const quote = collapseWhitespace(claim.quote);
      if (quote.length < MIN_SECONDARY_QUOTE_CHARS) return false;
      const rule = SECONDARY_QUOTE_RULES[role];
      if (rule?.requires && !rule.requires.test(quote)) return false;
      if (rule?.excludes?.test(quote) || NOT_TASK_QUOTE.test(quote)) return false;
      return EVIDENCE_FIELDS.some(field => collapseWhitespace(input[field] ?? "").includes(quote));
    });
  const roles = [...new Set(output.secondaryRoles)]
    .filter(role => role !== output.primaryRole && supported(role))
    .slice(0, 2);
  const { primaryRole, summary, evidence, needsReview, majors } = output;
  return assertEvidence(input, { primaryRole, secondaryRoles: roles, summary, evidence, needsReview, majors });
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
  saved?: string;
  /** Side-nav shortcuts: "open" (not closed), "soon" (open, closing within three days) or "new" (first seen in the last three KST business days). */
  when?: string;
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
  major: Major | null = null,
) {
  const query = (filters.q ?? "").toLocaleLowerCase().trim();
  const rows = postings.filter(p => {
    const role = p.classification;
    return (
      (!query ||
        [p.company, p.title, p.department, p.tasks, p.qualifications, p.attachment?.text ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query)) &&
      (!filters.role || role?.primaryRole === filters.role || role?.secondaryRoles.includes(filters.role as Role)) &&
      (!filters.term || p.term === filters.term) &&
      (!filters.location || regionOf(p.location) === filters.location) &&
      (!filters.duration || String(periodMonths(p.period)) === filters.duration) &&
      (!filters.stipend ||
        (p.stipend.unit === "month" && p.stipend.amount !== null && p.stipend.amount >= Number(filters.stipend))) &&
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
