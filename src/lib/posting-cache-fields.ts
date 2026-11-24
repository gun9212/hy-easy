import type { Posting, PostingAttachment } from "./domain";
import { toListPosting } from "./posting-body";

/** Bump when the cached Posting shape or field allowlist changes so older copies are replaced. */
export const POSTING_CACHE_VERSION = 3;

/**
 * Explicit allowlist of Posting fields stored in the browser's IndexedDB cache.
 *
 * The sync sends list copies (posting-body.ts): the source texts, attachment text and classification evidence are
 * empty and `bodyOmitted` is set, so those fields are stored empty. The detail and comparison screens fetch the full
 * posting and keep it in memory only. Version 3 replaced the earlier copies that held the full texts.
 */
export const CACHED_POSTING_FIELDS = [
  "id",
  "sourceId",
  "sourceUrl",
  "company",
  "department",
  "title",
  "term",
  "location",
  "period",
  "headcount",
  "applicants",
  "programType",
  "majors",
  "stipend",
  "deadline",
  "recruitment",
  "practiceInfo",
  "qualifications",
  "tasks",
  "benefits",
  "events",
  "attachment",
  "firstSeenAt",
  "updatedAt",
  "lastCheckedAt",
  "changedAt",
  "classification",
  "classificationSource",
  "classificationStale",
  "bodyOmitted",
] as const satisfies readonly (keyof Posting)[];

export const CACHED_ATTACHMENT_FIELDS = [
  "fileName",
  "fileHash",
  "pages",
  "text",
  "truncated",
  "extractedAt",
] as const satisfies readonly (keyof PostingAttachment)[];

function pickCachedAttachment(attachment: PostingAttachment): PostingAttachment {
  return {
    fileName: attachment.fileName,
    fileHash: attachment.fileHash,
    pages: attachment.pages,
    text: attachment.text,
    truncated: attachment.truncated,
    extractedAt: attachment.extractedAt,
  };
}

/**
 * Projects a Posting down to the exact fields allowed in browser IndexedDB storage. Always a list copy: even if a full
 * posting reaches here, its source texts, attachment text and evidence quotes are not stored.
 */
export function pickCachedPosting(full: Posting): Posting {
  const posting = toListPosting(full);
  const cached: Posting = {
    id: posting.id,
    sourceId: posting.sourceId,
    sourceUrl: posting.sourceUrl,
    company: posting.company,
    department: posting.department,
    title: posting.title,
    term: posting.term,
    location: posting.location,
    period: posting.period,
    headcount: posting.headcount,
    applicants: posting.applicants,
    programType: posting.programType,
    majors: posting.majors,
    stipend: {
      amount: posting.stipend.amount,
      unit: posting.stipend.unit,
      raw: posting.stipend.raw,
    },
    deadline: {
      raw: posting.deadline.raw,
      at: posting.deadline.at,
      date: posting.deadline.date,
      precision: posting.deadline.precision,
    },
    recruitment: posting.recruitment,
    practiceInfo: posting.practiceInfo,
    qualifications: posting.qualifications,
    tasks: posting.tasks,
    benefits: posting.benefits,
    events: posting.events.map(event => ({ label: event.label, raw: event.raw })),
    firstSeenAt: posting.firstSeenAt,
    updatedAt: posting.updatedAt,
    lastCheckedAt: posting.lastCheckedAt,
    classification: posting.classification,
    classificationSource: posting.classificationSource,
    classificationStale: posting.classificationStale,
  };
  if (posting.changedAt !== undefined) cached.changedAt = posting.changedAt;
  cached.bodyOmitted = true;
  if (posting.attachment) cached.attachment = pickCachedAttachment(posting.attachment);
  return cached;
}
