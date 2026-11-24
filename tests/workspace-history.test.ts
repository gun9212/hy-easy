import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchOfFilters, shouldPushHistory, viewOfFilters } from "../src/lib/workspace-history";

describe("workspace browser history transitions", () => {
  it("pushes history when switching between postings, saved, and planner views", () => {
    assert.equal(viewOfFilters({}), "postings");
    assert.equal(viewOfFilters({ saved: "true" }), "saved");
    assert.equal(viewOfFilters({ saved: "planner", posting: "p-1" }), "planner");

    // postings -> saved -> planner -> back
    assert.equal(shouldPushHistory({}, { saved: "true" }), true);
    assert.equal(shouldPushHistory({ saved: "true" }, { saved: "planner" }), true);
    assert.equal(shouldPushHistory({ saved: "planner" }, { saved: "true" }), true);
    assert.equal(shouldPushHistory({ saved: "true" }, {}), true);
  });

  it("pushes history for top-level when shortcuts (open/soon/new)", () => {
    assert.equal(shouldPushHistory({}, { when: "soon" }), true);
    assert.equal(shouldPushHistory({ when: "soon" }, {}), true);
  });

  it("uses replaceState when typing search queries or adjusting secondary filters on the same view", () => {
    assert.equal(shouldPushHistory({}, { q: "한" }), false);
    assert.equal(shouldPushHistory({ q: "한" }, { q: "한양" }), false);
    assert.equal(shouldPushHistory({ q: "한양" }, { q: "한양대" }), false);
    assert.equal(shouldPushHistory({ q: "한양대" }, {}), false);
    assert.equal(shouldPushHistory({}, { role: "개발" }), false);
    assert.equal(shouldPushHistory({ role: "개발" }, { role: "개발", sort: "stipend" }), false);
  });

  it("serializes only non-empty filter entries", () => {
    assert.equal(searchOfFilters({}), "");
    assert.equal(searchOfFilters({ saved: "planner", posting: "p-1", q: "" }), "?saved=planner&posting=p-1");
  });
});
