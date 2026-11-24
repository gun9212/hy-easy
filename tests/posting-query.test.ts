import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterPostings, type Posting } from "../src/lib/domain";
import { matchesWhen } from "../src/lib/posting-format";
import { DEFAULT_POSTING_SORT, filtersFromSearchParams, queryPostings } from "../src/lib/posting-query";
import { samplePostings } from "../src/lib/sample";

const now = new Date("2026-11-10T13:00:00+09:00");

describe("queryPostings parity between /api/postings and PostingsView", () => {
  it("defaults to deadline sort and matches the screen's exact IDs and order for major and when filters", () => {
    const base = samplePostings[0];
    const items: Posting[] = [
      {
        ...base,
        id: "p-later-open",
        recruitment: "open",
        deadline: { raw: "2026.11.20", at: "2026-11-20T18:00:00+09:00", date: "2026-11-20", precision: "minute" },
        firstSeenAt: "2026-11-10T12:00:00+09:00",
        classification: {
          ...base.classification!,
          majors: { requirement: "any", required: [], preferred: [], related: [] },
        },
      },
      {
        ...base,
        id: "p-soon-open",
        recruitment: "open",
        deadline: { raw: "2026.11.12", at: "2026-11-12T18:00:00+09:00", date: "2026-11-12", precision: "minute" },
        firstSeenAt: "2026-11-10T09:00:00+09:00",
        classification: {
          ...base.classification!,
          majors: { requirement: "listed", required: ["컴퓨터소프트웨어학부"], preferred: [], related: [] },
        },
      },
      {
        ...base,
        id: "p-other-major",
        recruitment: "open",
        deadline: { raw: "2026.11.11", at: "2026-11-11T18:00:00+09:00", date: "2026-11-11", precision: "minute" },
        firstSeenAt: "2026-11-10T11:00:00+09:00",
        classification: {
          ...base.classification!,
          majors: { requirement: "listed", required: ["경영학부"], preferred: [], related: [] },
        },
      },
      {
        ...base,
        id: "p-closed",
        recruitment: "closed",
        deadline: { raw: "2026.11.09", at: "2026-11-09T18:00:00+09:00", date: "2026-11-09", precision: "minute" },
        firstSeenAt: "2026-11-09T09:00:00+09:00",
        classification: {
          ...base.classification!,
          majors: { requirement: "any", required: [], preferred: [], related: [] },
        },
      },
    ];

    const params = new URLSearchParams("when=open&when=ignored");
    const filters = filtersFromSearchParams(params);
    assert.deepEqual(filters, { when: "open" });

    const apiResult = queryPostings(items, filters, { major: "컴퓨터소프트웨어학부", now });
    const screenResult = filterPostings(
      items,
      { ...filters, sort: DEFAULT_POSTING_SORT },
      [],
      "컴퓨터소프트웨어학부",
    ).filter(p => matchesWhen(p, filters.when, now));

    assert.deepEqual(
      apiResult.map(p => p.id),
      screenResult.map(p => p.id),
    );
    // p-other-major is hidden by major, p-closed is excluded by when=open, and p-soon-open sorts before p-later-open.
    assert.deepEqual(
      apiResult.map(p => p.id),
      ["p-soon-open", "p-later-open"],
    );

    // when=soon narrows to closing soon only.
    assert.deepEqual(
      queryPostings(items, { when: "soon" }, { major: "컴퓨터소프트웨어학부", now }).map(p => p.id),
      ["p-soon-open"],
    );

    // Explicit sort=latest overrides the default deadline sort.
    assert.deepEqual(
      queryPostings(items, { when: "open", sort: "latest" }, { major: "컴퓨터소프트웨어학부", now }).map(p => p.id),
      ["p-later-open", "p-soon-open"],
    );
  });
});
