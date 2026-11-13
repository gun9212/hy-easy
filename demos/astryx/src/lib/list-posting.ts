import type { Classification, Posting } from "@lib/domain";

/**
 * What the list needs from a posting. The long texts (practice info, tasks, qualifications, benefits, events) and the
 * classifier's evidence stay on the server until the drawer asks for one posting, which keeps the first page small.
 */
export type ListPosting = Omit<
  Posting,
  "practiceInfo" | "qualifications" | "tasks" | "benefits" | "events" | "classification"
> & { classification: Pick<Classification, "primaryRole" | "needsReview"> | null };

/** The drawer's extra fields, fetched per posting from /api/postings/[id]. */
export type PostingDetail = Pick<Posting, "id" | "practiceInfo" | "qualifications" | "tasks" | "benefits">;

export function toListPosting(posting: Posting): ListPosting {
  const { classification } = posting;
  return {
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
    stipend: posting.stipend,
    deadline: posting.deadline,
    recruitment: posting.recruitment,
    firstSeenAt: posting.firstSeenAt,
    updatedAt: posting.updatedAt,
    lastCheckedAt: posting.lastCheckedAt,
    classificationSource: posting.classificationSource,
    classificationStale: posting.classificationStale,
    classification: classification
      ? { primaryRole: classification.primaryRole, needsReview: classification.needsReview }
      : null,
  };
}

export function toDetail(posting: Posting): PostingDetail {
  const { id, practiceInfo, qualifications, tasks, benefits } = posting;
  return { id, practiceInfo, qualifications, tasks, benefits };
}
