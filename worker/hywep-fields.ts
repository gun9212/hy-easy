// Pure mapping from HY-WEP list rows and detail tables to Posting.
// Field labels were measured on 2026-11-10; see docs/HYWEP-STRUCTURE.md.
import {
  combineDeadline, parseCount, parseSelectionInfo, parseStipend, splitInstitution, stableHash,
} from "../src/lib/normalize";
import type { Posting } from "../src/lib/domain";

/** List column header (whitespace removed) prefix → field key. */
export const LIST_COLUMNS = {
  category: "실습기관분류",
  company: "실습기관명",
  department: "부서",
  status: "실습기관진행상태",
  location: "소재지",
  deadlineDate: "모집마감일",
  deadlineTime: "마감시간",
  period: "실습기간",
  stipend: "기관지원금",
  programType: "유형",
  majors: "모집전공",
  headcount: "모집인원",
  applicants: "지원인원",
} as const;

export type ListKey = keyof typeof LIST_COLUMNS;
export type ListFields = Partial<Record<ListKey, string>>;
export type ListRow = { id: string; url: string; fields: ListFields };
export type DetailFields = Record<string, string>;

const REQUIRED_LIST_KEYS: readonly ListKey[] = ["company", "department", "status", "deadlineDate"];
const OPEN_STATUS = /^(접수\s*중|모집\s*중)$/;
const CLOSED_STATUS = /^(접수\s*마감|모집\s*마감|마감|종료)$/;
const JOB_TITLE = /직무명\s*[:：]\s*([^\n]+?)\s*(?:-\s*직무개요|\n|$)/;

export function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, "").replace(/[:：]$/, "");
}

/** Maps header texts to column indexes. Throws when a required column is missing. */
export function columnIndex(headers: readonly string[]): Partial<Record<ListKey, number>> {
  const labels = headers.map(normalizeLabel);
  const index: Partial<Record<ListKey, number>> = {};
  for (const [key, prefix] of Object.entries(LIST_COLUMNS) as [ListKey, string][]) {
    const position = labels.findIndex(label => label.startsWith(prefix));
    if (position >= 0) index[key] = position;
  }
  const missing = REQUIRED_LIST_KEYS.filter(key => index[key] === undefined);
  if (missing.length) throw new Error(`LIST_STRUCTURE_CHANGED: ${missing.join(",")}`);
  return index;
}

export function listFields(cells: readonly string[], index: Partial<Record<ListKey, number>>): ListFields {
  const fields: ListFields = {};
  for (const [key, position] of Object.entries(index) as [ListKey, number][]) {
    fields[key] = (cells[position] ?? "").replace(/\s+/g, " ").trim();
  }
  return fields;
}

/** Change-detection hash of a list row. The live applicant count is excluded. */
export function listRowHash(fields: ListFields): string {
  const { applicants: _applicants, ...stable } = fields;
  void _applicants;
  return stableHash(stable);
}

/** Extracts the posting ID from a link attribute (href or onclick) with a one-group regex. */
export function extractSourceId(attribute: string | null, pattern: string): string {
  const match = attribute?.match(new RegExp(pattern));
  const id = match?.[1]?.trim();
  if (!id) throw new Error("SOURCE_ID_NOT_FOUND");
  if (!/^[\w.-]{1,64}$/.test(id)) throw new Error("SOURCE_ID_INVALID");
  return id;
}

/** Replaces `{key}` placeholders with URL-encoded values. Throws on an unfilled placeholder. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  const filled = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (values[key] === undefined) throw new Error(`TEMPLATE_VALUE_MISSING: ${key}`);
    return encodeURIComponent(String(values[key]));
  });
  return filled;
}

/** HY-WEP list pages are zero-based (`pg=0` is page 1). A missing `pg` means the first page. */
export function pageNumber(url: string): number {
  const value = Number(new URL(url).searchParams.get("pg") ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

/** True when the paging links (e.g. `javaScript:Paging(3)`) offer the page after `current`. */
export function hasNextPage(pagingHrefs: readonly (string | null)[], current: number, pattern: string): boolean {
  const regex = new RegExp(pattern);
  return pagingHrefs.some(href => Number(href?.match(regex)?.[1]) === current + 1);
}

export function recruitmentStatus(raw: string | undefined): Posting["recruitment"] {
  const text = raw?.trim() ?? "";
  if (OPEN_STATUS.test(text)) return "open";
  if (CLOSED_STATUS.test(text)) return "closed";
  return "unknown";
}

/** "2026년도 겨울학기 단기 현장실습(,2027.01.01~2027.02.28)" → "2026년도 겨울학기 단기 현장실습" */
export function termName(raw: string): string {
  return raw.replace(/\s*\(.*\)\s*$/, "").trim();
}

function jobTitle(tasks: string): string {
  return tasks.match(JOB_TITLE)?.[1]?.trim() ?? "";
}

function labelled(pairs: readonly [string, string | undefined][]): string {
  return pairs.filter(([, value]) => value?.trim()).map(([label, value]) => `${label}: ${value?.trim()}`).join("\n");
}

function institution(detail: DetailFields, list: ListFields) {
  const fromDetail = splitInstitution(detail["실습기관명"] ?? "");
  return {
    company: list.company || fromDetail.company,
    department: list.department || fromDetail.department,
  };
}

function deadline(detail: DetailFields, list: ListFields) {
  if (list.deadlineDate) return combineDeadline(list.deadlineDate, list.deadlineTime ?? "");
  return parseSelectionInfo(detail["선발정보"] ?? "").deadline;
}

/** Merges a list row (status, deadline, counts) with its detail table (texts). */
export function normalizeDetail(detail: DetailFields, row: ListRow, checkedAt = new Date().toISOString()): Posting {
  const list = row.fields;
  const { company, department } = institution(detail, list);
  const tasks = detail["실습내용"]?.trim() ?? "";
  const qualifications = detail["자격사항"]?.trim() ?? "";
  if (!company || (!tasks && !qualifications)) throw new Error("DETAIL_REQUIRED_FIELDS_MISSING");

  const selection = parseSelectionInfo(detail["선발정보"] ?? "");
  const programType = list.programType || detail["유형"]?.trim() || "";
  const majors = list.majors || detail["선발대상"]?.trim() || "";
  return {
    id: "", sourceId: row.id, sourceUrl: row.url, company, department,
    title: jobTitle(tasks) || department || company,
    term: termName(detail["현장실습명"] ?? ""),
    location: list.location || detail["소재지"]?.trim() || "",
    period: (detail["실습기간"] || list.period || "").replace(/\s+/g, " ").trim(),
    headcount: parseCount(list.headcount ?? "") ?? selection.headcount,
    applicants: parseCount(list.applicants ?? ""),
    programType, majors,
    stipend: parseStipend(detail["기관지원금"] || list.stipend || ""),
    deadline: deadline(detail, list),
    recruitment: recruitmentStatus(list.status),
    practiceInfo: labelled([["유형", programType], ["선발대상", majors], ["학년", selection.grade]]),
    qualifications, tasks,
    benefits: labelled([
      ["근무시간", detail["근무시간"]], ["근무요일", detail["근무요일"]],
      ["숙식제공", detail["숙식제공여부"]], ["지원금 지급일", detail["기관지원금지급일"]],
    ]),
    events: detail["면접정보"]?.trim() ? [{ label: "면접정보", raw: detail["면접정보"].trim() }] : [],
    firstSeenAt: checkedAt, updatedAt: checkedAt, lastCheckedAt: checkedAt,
    classification: null, classificationSource: null, classificationStale: false,
  };
}
