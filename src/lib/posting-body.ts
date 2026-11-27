// The posting list the browser syncs leaves out the long texts: HY-WEP's source texts, the attachment text and the
// classification evidence quotes. They were about two thirds of the list (2026-11-25: 1.29 MB of 2.06 MB for 417
// postings) and only the detail and comparison screens show them, so those fetch one posting from /api/postings/[id].
// Search over those texts runs on the server (/api/postings/search).
import { MAX_SEARCH_QUERY_CHARS, type Posting } from "./domain";

export { MAX_SEARCH_QUERY_CHARS };

/** The list copy of a posting: everything the list, filters, cards and planner use, without the long texts. */
export function toListPosting(posting: Posting): Posting {
  const list: Posting = {
    ...posting,
    practiceInfo: "",
    qualifications: "",
    tasks: "",
    benefits: "",
    classification: posting.classification ? { ...posting.classification, evidence: [] } : null,
    bodyOmitted: true,
  };
  if (posting.attachment) list.attachment = { ...posting.attachment, text: "" };
  return list;
}
