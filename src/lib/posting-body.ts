// The posting list the browser syncs leaves out the long texts: HY-WEP's source texts, the attachment text and the
// classification evidence quotes. They were about two thirds of the list (2026-11-25: 1.29 MB of 2.06 MB for 417
// postings) and only the detail and comparison screens show them, so those fetch one posting from /api/postings/[id].
// Search over those texts runs on the server (/api/postings/search).
import type { Posting } from "./domain";

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

/** Most characters a search query may have; longer input is cut (the search box has no reason to send more). */
export const MAX_SEARCH_QUERY_CHARS = 100;
