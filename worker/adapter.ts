// Playwright access to HY-WEP. Parsing lives in ./hywep-fields.ts so it can be tested without a browser.
import { z } from "zod";
import type { Locator, Page } from "playwright";
import type { Posting } from "../src/lib/domain";
import {
  columnIndex, extractSourceId, listFields, normalizeDetail, normalizeLabel,
  type DetailFields, type ListRow,
} from "./hywep-fields";

const HYWEP_HOST = "hywep.hanyang.ac.kr";
const HYWEP_ORIGIN = `https://${HYWEP_HOST}/`;
const NAVIGATION_TIMEOUT_MS = 25_000;

export const selectorsSchema = z.object({
  verified: z.boolean(),
  authenticated: z.string().min(1),
  listReady: z.string().min(1),
  emptyList: z.string().min(1),
  listHeader: z.string().min(1),
  listRow: z.string().min(1),
  listCell: z.string().min(1),
  detailLink: z.string().min(1),
  /** Attribute on detailLink that carries the posting ID, e.g. "onclick" or "href". */
  sourceIdAttribute: z.string().min(1),
  /** Regex with exactly one capture group for the ID inside that attribute. */
  sourceIdPattern: z.string().min(1),
  /** The detail page has no query string in the browser; this template must be verified to work with GET. */
  detailUrlTemplate: z.string().includes("{id}"),
  nextPage: z.string().min(1),
  nextDisabled: z.string().min(1),
  detailReady: z.string().min(1),
  detailRows: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
}).strict();
export type Selectors = z.infer<typeof selectorsSchema>;

export class SessionExpired extends Error {
  constructor() { super("SESSION_EXPIRED"); }
}

export function sourceUrl(raw: string, base = HYWEP_ORIGIN): string {
  const url = new URL(raw, base);
  if (url.protocol !== "https:" || url.hostname !== HYWEP_HOST || url.username || url.password) {
    throw new Error("UNTRUSTED_SOURCE_URL");
  }
  return url.toString();
}

export function detailUrl(template: string, id: string): string {
  return sourceUrl(template.replaceAll("{id}", encodeURIComponent(id)));
}

/** The portal shows a JS alert (e.g. password-change notice) during login; dismiss it. */
export function dismissDialogs(page: Page): void {
  page.on("dialog", dialog => { void dialog.dismiss().catch(() => undefined); });
}

export async function assertSession(page: Page, s: Selectors): Promise<void> {
  if (!await page.locator(s.authenticated).count()) throw new SessionExpired();
}

async function readRow(row: Locator, s: Selectors, index: ReturnType<typeof columnIndex>): Promise<ListRow> {
  const cells = await row.locator(s.listCell).allInnerTexts();
  const attribute = await row.locator(s.detailLink).first().getAttribute(s.sourceIdAttribute);
  const id = extractSourceId(attribute, s.sourceIdPattern);
  return { id, url: detailUrl(s.detailUrlTemplate, id), fields: listFields(cells, index) };
}

async function nextPageUrl(page: Page, s: Selectors): Promise<string | null> {
  const next = page.locator(s.nextPage).first();
  if (!await next.count()) return null;
  if (await next.evaluate((el, selector) => el.matches(selector), s.nextDisabled)) return null;
  const href = await next.getAttribute("href");
  if (!href) throw new Error("NEXT_PAGE_LINK_MISSING");
  return sourceUrl(href, page.url());
}

/** Reads every posting row on the current list page. An empty list must be confirmed explicitly. */
export async function readListPage(page: Page, s: Selectors): Promise<{ rows: ListRow[]; nextUrl: string | null }> {
  await assertSession(page, s);
  if (!await page.locator(s.listReady).count()) throw new Error("LIST_STRUCTURE_CHANGED");
  const rowLocator = page.locator(s.listRow);
  const count = await rowLocator.count();
  if (!count) {
    if (!await page.locator(s.emptyList).count()) throw new Error("LIST_NOT_CONFIRMED_EMPTY");
    return { rows: [], nextUrl: null };
  }
  const index = columnIndex(await page.locator(s.listHeader).allInnerTexts());
  const rows: ListRow[] = [];
  for (let i = 0; i < count; i++) rows.push(await readRow(rowLocator.nth(i), s, index));
  return { rows, nextUrl: await nextPageUrl(page, s) };
}

async function readDetailFields(page: Page, s: Selectors): Promise<DetailFields> {
  const fields: DetailFields = {};
  const rows = page.locator(s.detailRows);
  for (let i = 0; i < await rows.count(); i++) {
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

export async function readDetail(page: Page, s: Selectors, row: ListRow): Promise<Posting> {
  await page.goto(sourceUrl(row.url), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await assertSession(page, s);
  if (!await page.locator(s.detailReady).count()) throw new Error("DETAIL_STRUCTURE_CHANGED");
  return normalizeDetail(await readDetailFields(page, s), row);
}
