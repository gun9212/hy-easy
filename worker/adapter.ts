// Playwright access to HY-WEP. Parsing lives in ./hywep-fields.ts so it can be tested without a browser.
// Page structure measured on 2026-11-10: docs/HYWEP-STRUCTURE.md.
import { z } from "zod";
import type { Locator, Page } from "playwright";
import type { Posting, PostingAttachment } from "../src/lib/domain";
import { MAX_ATTACHMENT_BYTES, parseFileDown, toAttachment } from "./attachments";
import {
  columnIndex,
  extractSourceId,
  fillTemplate,
  hasNextPage,
  listFields,
  normalizeDetail,
  normalizeLabel,
  pageNumber,
  type DetailFields,
  type ListRow,
} from "./hywep-fields";

const HYWEP_HOST = "hywep.hanyang.ac.kr";
const HYWEP_ORIGIN = `https://${HYWEP_HOST}/`;
const NAVIGATION_TIMEOUT_MS = 25_000;

const templateWith = (...keys: string[]) =>
  z.string().refine(value => keys.every(key => value.includes(`{${key}}`)), `must contain ${keys.join(", ")}`);

export const selectorsSchema = z
  .object({
    verified: z.boolean(),
    authenticated: z.string().min(1),
    /**
     * Hidden input holding the term (schedule) HY-WEP selects by default: the term currently recruiting.
     * The term cards also list past terms (closed long ago), which are not collected.
     */
    currentSchedule: z.string().min(1),
    /** GET list URL. `{page}` is zero-based. */
    listUrlTemplate: templateWith("schedule", "page"),
    listReady: z.string().min(1),
    emptyList: z.string().min(1),
    listHeader: z.string().min(1),
    listRow: z.string().min(1),
    listCell: z.string().min(1),
    pagingLink: z.string().min(1),
    pagingPattern: z.string().min(1),
    detailLink: z.string().min(1),
    sourceIdAttribute: z.string().min(1),
    sourceIdPattern: z.string().min(1),
    detailUrlTemplate: templateWith("id"),
    detailReady: z.string().min(1),
    detailRows: z.string().min(1),
    label: z.string().min(1),
    value: z.string().min(1),
    /** "모집공고 추가자료" link on the detail page; its onclick calls fileDown(jid_seq, org_name, fake_name, ext). */
    attachmentLink: z.string().min(1),
    /** fileDown() posts its four arguments as a form here (same session). */
    attachmentDownloadUrl: z.string().min(1),
  })
  .strict();
export type Selectors = z.infer<typeof selectorsSchema>;

export class SessionExpired extends Error {
  constructor() {
    super("SESSION_EXPIRED");
  }
}

export function sourceUrl(raw: string, base = HYWEP_ORIGIN): string {
  const url = new URL(raw, base);
  if (url.protocol !== "https:" || url.hostname !== HYWEP_HOST || url.username || url.password) {
    throw new Error("UNTRUSTED_SOURCE_URL");
  }
  return url.toString();
}

export function detailUrl(template: string, id: string): string {
  return sourceUrl(fillTemplate(template, { id }));
}

export function listUrl(template: string, schedule: string, page: number): string {
  return sourceUrl(fillTemplate(template, { schedule, page }));
}

/** The portal shows a JS alert (e.g. password-change notice) during login; dismiss it. */
export function dismissDialogs(page: Page): void {
  page.on("dialog", dialog => {
    void dialog.dismiss().catch(() => undefined);
  });
}

export async function assertSession(page: Page, s: Selectors): Promise<void> {
  if (!(await page.locator(s.authenticated).count())) throw new SessionExpired();
}

async function attributes(locator: Locator, name: string): Promise<(string | null)[]> {
  return locator.evaluateAll((elements, attr) => elements.map(el => el.getAttribute(attr)), name);
}

/** Parses an explicit term list such as "119,120". Returns null when unset. */
export function parseScheduleOverride(raw: string | undefined): string[] | null {
  const ids = (raw ?? "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);
  if (!ids.length) return null;
  if (!ids.every(id => /^\d+$/.test(id))) throw new Error("HYWEP_SCHEDULES_INVALID");
  return [...new Set(ids)];
}

/**
 * Returns the first list page of each term to collect: the explicit override,
 * otherwise only the term HY-WEP selects by default (the one currently recruiting).
 */
export async function readScheduleUrls(page: Page, s: Selectors, override: string[] | null = null): Promise<string[]> {
  await assertSession(page, s);
  const ids = override ?? [await page.locator(s.currentSchedule).first().inputValue()];
  if (!ids.every(id => /^\d+$/.test(id))) throw new Error("CURRENT_SCHEDULE_NOT_FOUND");
  return ids.map(id => listUrl(s.listUrlTemplate, id, 0));
}

async function readRow(row: Locator, s: Selectors, index: ReturnType<typeof columnIndex>): Promise<ListRow> {
  const cells = await row.locator(s.listCell).allInnerTexts();
  const attribute = await row.locator(s.detailLink).first().getAttribute(s.sourceIdAttribute);
  const id = extractSourceId(attribute, s.sourceIdPattern);
  return { id, url: detailUrl(s.detailUrlTemplate, id), fields: listFields(cells, index) };
}

function nextListUrl(currentUrl: string, pagingHrefs: (string | null)[], s: Selectors): string | null {
  const current = pageNumber(currentUrl);
  if (!hasNextPage(pagingHrefs, current, s.pagingPattern)) return null;
  const schedule = new URL(currentUrl).searchParams.get("schedule");
  if (!schedule) throw new Error("SCHEDULE_PARAM_MISSING");
  return listUrl(s.listUrlTemplate, schedule, current + 1);
}

/** Reads every posting row on the current list page. An empty list must be confirmed explicitly. */
export async function readListPage(page: Page, s: Selectors): Promise<{ rows: ListRow[]; nextUrl: string | null }> {
  await assertSession(page, s);
  if (!(await page.locator(s.listReady).count())) throw new Error("LIST_STRUCTURE_CHANGED");
  const rowLocator = page.locator(s.listRow);
  const count = await rowLocator.count();
  if (!count) {
    if (!(await page.locator(s.emptyList).count())) throw new Error("LIST_NOT_CONFIRMED_EMPTY");
    return { rows: [], nextUrl: null };
  }
  const index = columnIndex(await page.locator(s.listHeader).allInnerTexts());
  const rows: ListRow[] = [];
  for (let i = 0; i < count; i++) rows.push(await readRow(rowLocator.nth(i), s, index));
  const pagingHrefs = await attributes(page.locator(s.pagingLink), "href");
  return { rows, nextUrl: nextListUrl(page.url(), pagingHrefs, s) };
}

async function readDetailFields(page: Page, s: Selectors): Promise<DetailFields> {
  const fields: DetailFields = {};
  const rows = page.locator(s.detailRows);
  for (let i = 0; i < (await rows.count()); i++) {
    const labels = await rows.nth(i).locator(s.label).allInnerTexts();
    const values = await rows.nth(i).locator(s.value).allInnerTexts();
    if (labels.length > values.length) throw new Error("DETAIL_LABEL_VALUE_MISMATCH");
    labels.forEach((text, j) => {
      const label = normalizeLabel(text);
      const value = values[j].trim();
      if (fields[label] !== undefined && fields[label] !== value) throw new Error("DETAIL_DUPLICATE_LABEL");
      fields[label] = value;
    });
  }
  return fields;
}

/**
 * The detail page is a popup layout without the logout link, so the list-page session check does not apply.
 * An expired session redirects away from the detail path instead.
 */
export function redirectedAway(requestedUrl: string, actualUrl: string): boolean {
  return new URL(actualUrl).pathname !== new URL(requestedUrl).pathname;
}

export async function readDetail(page: Page, s: Selectors, row: ListRow): Promise<Posting> {
  const url = sourceUrl(row.url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  if (redirectedAway(url, page.url())) throw new SessionExpired();
  if (!(await page.locator(s.detailReady).count())) throw new Error("DETAIL_STRUCTURE_CHANGED");
  return normalizeDetail(await readDetailFields(page, s), row);
}

/**
 * Downloads the "모집공고 추가자료" file of the detail page that is open now (call right after readDetail) and
 * extracts its text. Returns null when the page has no attachment. The file is kept in memory only.
 */
export async function readAttachment(page: Page, s: Selectors): Promise<PostingAttachment | null> {
  const anchor = page.locator(s.attachmentLink).first();
  if (!(await anchor.count())) return null;
  const link = parseFileDown(await anchor.getAttribute("onclick"));
  if (!link) throw new Error("ATTACHMENT_LINK_CHANGED");
  const response = await page.context().request.post(sourceUrl(s.attachmentDownloadUrl), {
    form: { jid_seq: link.jidSeq, org_name: link.orgName, fake_name: link.fakeName, ext: link.ext },
    timeout: NAVIGATION_TIMEOUT_MS,
    maxRedirects: 0,
  });
  if (!response.ok()) throw new Error(`ATTACHMENT_HTTP_${response.status()}`);
  const declared = Number(response.headers()["content-length"] ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
  return toAttachment(link, await response.body());
}
