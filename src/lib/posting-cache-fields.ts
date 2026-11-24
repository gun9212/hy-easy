import type { Posting, PostingAttachment } from "./domain";

/** Bump when the cached Posting shape or field allowlist changes so older copies are replaced. */
export const POSTING_CACHE_VERSION = 2;

/**
 * Explicit allowlist of Posting fields stored in the browser's IndexedDB cache.
 *
 * Kept to what list, search, detail, and side-by-side comparison render offline between incremental
 * syncs (`tasks`, `qualifications`, `practiceInfo`, `benefits`, `events`, and `attachment.text` are
 * included because incremental sync only sends changed postings and client search/detail read them
 * locally). Because company-authored source texts and attachments may include recruiter contact
 * details, the privacy policy documents this scope and logout clears the cache.
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

/** Projects a Posting down to the exact fields allowed in browser IndexedDB storage. */
export function pickCachedPosting(posting: Posting): Posting {
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
  if (posting.attachment) cached.attachment = pickCachedAttachment(posting.attachment);
  return cached;
}
