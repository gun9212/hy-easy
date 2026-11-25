// Attached PDFs for postings whose tasks only say "see the attached file" (e.g. 비상교육: "실습 내용은 모집공고
// 추가자료 파일 참고"). The text is pulled out with a plain PDF reader (unpdf); no AI is involved, so nothing can
// be invented and the classifier's evidence check works on it unchanged. The file itself is never stored.
// Page structure: docs/HYWEP-STRUCTURE.md §3.
import { createHash } from "node:crypto";
import { getDocumentProxy } from "unpdf";
import type { Posting, PostingAttachment } from "../src/lib/domain";

/** Tasks shorter than this are "empty"; longer ones carry enough to classify even when they mention a file. */
export const MAX_TASKS_CHARS_FOR_ATTACHMENT = 150;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Rejects oversized multi-hundred-page PDFs before parsing any page content. */
export const MAX_ATTACHMENT_PAGES = 30;
/** Caps concurrent page text extractions so a multi-page PDF cannot spike CPU/memory. */
export const PDF_EXTRACT_CONCURRENCY = 2;
/** Overall wall-clock budget for opening a PDF and extracting its page text. */
export const PDF_EXTRACT_TIMEOUT_MS = 10_000;
/** Enough for a multi-department table (비상교육: 13.6K chars over 5 pages); keeps the classifier input bounded. */
export const MAX_ATTACHMENT_CHARS = 20_000;
/** Below this the PDF is probably a scan (image) or empty. */
export const MIN_READABLE_CHARS = 200;
/** Share of letters (Hangul or Latin) among visible characters; garbled extraction falls below it. */
const MIN_LETTER_RATIO = 0.5;

const REFERS_TO_ATTACHMENT = /(추가\s*자료|첨부|별첨|붙임)[^\n]{0,15}?(참고|참조|확인)/;
const FILE_DOWN_CALL = /fileDown\(\s*'(\d+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/;

/** Arguments of HY-WEP's fileDown(jid_seq, org_name, fake_name, ext), posted as a form to its download URL. */
export type AttachmentLink = { jidSeq: string; orgName: string; fakeName: string; ext: string };

export type StreamableResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
};

/**
 * Streams an HTTP response body while enforcing `maxBytes` on actual received bytes (even when Content-Length is
 * missing or inaccurate), and cancels/releases the response body stream on both success and every error path.
 */
export async function readBoundedResponseBody(
  response: StreamableResponse,
  maxBytes = MAX_ATTACHMENT_BYTES,
): Promise<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    if (!response.ok) throw new Error(`ATTACHMENT_HTTP_${response.status}`);
    const contentLength = response.headers.get("content-length");
    const declared = contentLength !== null && contentLength.trim() !== "" ? Number(contentLength) : NaN;
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error("ATTACHMENT_TOO_LARGE");
    if (!response.body) return new Uint8Array(0);

    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("ATTACHMENT_TOO_LARGE");
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  } finally {
    if (reader) {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    } else if (response.body && !response.body.locked) {
      await response.body.cancel().catch(() => undefined);
    }
  }
}

/** Only postings whose tasks are (almost) empty and point to an attached file. */
export function needsAttachment(posting: Pick<Posting, "tasks">): boolean {
  const tasks = posting.tasks.trim();
  return tasks.length < MAX_TASKS_CHARS_FOR_ATTACHMENT && REFERS_TO_ATTACHMENT.test(tasks);
}

export function parseFileDown(onclick: string | null): AttachmentLink | null {
  const m = FILE_DOWN_CALL.exec(onclick ?? "");
  return m ? { jidSeq: m[1], orgName: m[2], fakeName: m[3], ext: m[4].toLowerCase() } : null;
}

export function isPdf(file: Uint8Array): boolean {
  return Buffer.from(file.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/** Rejects scans (too little text) and garbled extractions (mostly symbols). */
export function isReadable(text: string): boolean {
  const visible = text.replace(/\s+/g, "");
  if (visible.length < MIN_READABLE_CHARS) return false;
  const letters = (visible.match(/[가-힣A-Za-z]/g) ?? []).length;
  return letters / visible.length >= MIN_LETTER_RATIO;
}

/** Collapses runs of spaces (PDF text is full of them) but keeps line breaks, then caps the length. */
export function clipText(text: string, max = MAX_ATTACHMENT_CHARS): { text: string; truncated: boolean } {
  const tidy = text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return tidy.length > max ? { text: tidy.slice(0, max), truncated: true } : { text: tidy, truncated: false };
}

export type PdfPageLike = {
  getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
  cleanup?: () => void;
};

export type PdfDocumentLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy?: () => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
};

export type PdfExtractOptions = {
  maxPages?: number;
  concurrency?: number;
  timeoutMs?: number;
  openDocument?: (data: Uint8Array) => Promise<PdfDocumentLike>;
};

function withDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) return Promise.reject(new Error("ATTACHMENT_TIMEOUT"));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ATTACHMENT_TIMEOUT")), remaining);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function extractPdfText(
  file: Uint8Array,
  options: PdfExtractOptions = {},
): Promise<{ pages: number; text: string }> {
  const maxPages = options.maxPages ?? MAX_ATTACHMENT_PAGES;
  const concurrency = Math.max(1, options.concurrency ?? PDF_EXTRACT_CONCURRENCY);
  const timeoutMs = options.timeoutMs ?? PDF_EXTRACT_TIMEOUT_MS;
  const deadlineMs = Date.now() + timeoutMs;
  const open =
    options.openDocument ?? ((data: Uint8Array) => getDocumentProxy(data) as unknown as Promise<PdfDocumentLike>);

  let pdf: PdfDocumentLike | null = null;
  try {
    // unpdf hands the buffer to pdf.js, which may detach it; give it a copy.
    pdf = await withDeadline(open(new Uint8Array(file)), deadlineMs);
    const totalPages = pdf.numPages;
    if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > maxPages) {
      throw new Error("ATTACHMENT_TOO_MANY_PAGES");
    }

    const doc = pdf;
    const pageTexts = new Array<string>(totalPages);
    let nextIndex = 0;
    let aborted = false;

    const runWorker = async () => {
      while (!aborted) {
        const idx = nextIndex++;
        if (idx >= totalPages) break;
        try {
          const page = await withDeadline(doc.getPage(idx + 1), deadlineMs);
          try {
            const content = await withDeadline(page.getTextContent(), deadlineMs);
            pageTexts[idx] = content.items
              .filter(item => item.str != null)
              .map(item => `${item.str}${item.hasEOL ? "\n" : ""}`)
              .join("");
          } finally {
            page.cleanup?.();
          }
        } catch (err) {
          aborted = true;
          throw err;
        }
      }
    };

    const workerCount = Math.min(concurrency, totalPages);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    const text = pageTexts
      .join("\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
    return { pages: totalPages, text };
  } finally {
    if (pdf) {
      await Promise.resolve(pdf.destroy?.()).catch(() => undefined);
      await Promise.resolve(pdf.cleanup?.()).catch(() => undefined);
    }
  }
}

/** Validates a downloaded file and turns it into the stored attachment. Throws a short code when it can't. */
export async function toAttachment(
  link: AttachmentLink,
  file: Uint8Array,
  now = new Date(),
): Promise<PostingAttachment> {
  if (link.ext !== "pdf") throw new Error(`ATTACHMENT_NOT_PDF:${link.ext}`);
  if (file.length > MAX_ATTACHMENT_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
  if (!isPdf(file)) throw new Error("ATTACHMENT_NOT_PDF:content");
  const { pages, text } = await extractPdfText(file);
  if (!isReadable(text)) throw new Error("ATTACHMENT_UNREADABLE");
  return {
    fileName: `${link.orgName}.${link.ext}`,
    fileHash: createHash("sha256").update(file).digest("hex"),
    pages,
    ...clipText(text),
    extractedAt: now.toISOString(),
  };
}

export type AttachmentReader = (posting: Posting) => Promise<PostingAttachment | null>;

/**
 * Adds the attachment to a posting that needs one. A failed read keeps the attachment stored from an earlier run
 * (if any) so one bad download does not wipe it; the failure is logged and collection continues. The detail page
 * is re-read when its list row changes or after 24h, which retries naturally.
 */
function attachmentErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "ATTACHMENT_READ_FAILED";
  const m = error.message;
  if (
    m === "ATTACHMENT_LINK_CHANGED" ||
    m === "ATTACHMENT_TOO_LARGE" ||
    m === "ATTACHMENT_TOO_MANY_PAGES" ||
    m === "ATTACHMENT_TIMEOUT" ||
    m === "ATTACHMENT_UNREADABLE" ||
    /^ATTACHMENT_HTTP_\d{3}$/.test(m)
  ) {
    return m;
  }
  if (m.startsWith("ATTACHMENT_NOT_PDF")) return "ATTACHMENT_NOT_PDF";
  return "ATTACHMENT_READ_FAILED";
}

export async function withAttachment(
  posting: Posting,
  read: AttachmentReader,
  previous: () => Promise<PostingAttachment | null>,
): Promise<Posting> {
  if (!needsAttachment(posting)) return posting;
  try {
    const attachment = await read(posting);
    if (attachment) return { ...posting, attachment };
    console.log(JSON.stringify({ event: "attachment_missing", sourceId: posting.sourceId }));
    return posting;
  } catch (e) {
    console.error(
      JSON.stringify({
        severity: "WARNING",
        event: "attachment_failed",
        sourceId: posting.sourceId,
        errorCode: attachmentErrorCode(e),
      }),
    );
    const kept = await previous().catch(() => null);
    return kept ? { ...posting, attachment: kept } : posting;
  }
}
