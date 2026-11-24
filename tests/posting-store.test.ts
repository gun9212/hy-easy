import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type { Posting } from "../src/lib/domain";
import { CACHED_ATTACHMENT_FIELDS, CACHED_POSTING_FIELDS, pickCachedPosting } from "../src/lib/posting-cache-fields";
import { samplePostings } from "../src/lib/sample";

describe("browser posting cache field allowlist", () => {
  it("keeps only declared Posting and attachment fields and drops unknown extras", () => {
    const base = samplePostings[0];
    const noisy = {
      ...base,
      changedAt: "2026-11-24T01:00:00Z",
      attachment: {
        fileName: "plan.pdf",
        fileHash: "abc123",
        pages: 2,
        text: "업무 내용 안내",
        truncated: false,
        extractedAt: "2026-11-24T01:00:00Z",
        unexpectedAttachmentField: "drop-me",
      },
      unexpectedUserField: "student@hanyang.ac.kr",
    } as Posting & { unexpectedUserField: string };

    const cached = pickCachedPosting(noisy);
    assert.deepEqual(Object.keys(cached).sort(), [...CACHED_POSTING_FIELDS].sort());
    assert.deepEqual(Object.keys(cached.attachment!).sort(), [...CACHED_ATTACHMENT_FIELDS].sort());
    assert.equal("unexpectedUserField" in cached, false);
    assert.equal("unexpectedAttachmentField" in cached.attachment!, false);
    assert.equal(cached.tasks, base.tasks);
    assert.equal(cached.attachment?.text, "업무 내용 안내");
  });

  it("omits attachment and changedAt when absent", () => {
    const base = { ...samplePostings[0], attachment: undefined, changedAt: undefined };
    const cached = pickCachedPosting(base);
    assert.equal("attachment" in cached, false);
    assert.equal("changedAt" in cached, false);
  });

  it("privacy policy accurately describes cached source/attachment fields and contact scope", () => {
    const privacy = readFileSync(path.join(process.cwd(), "src", "app", "privacy", "page.tsx"), "utf8");
    assert.doesNotMatch(privacy, /여기에는 개인정보가 들어가지\s*않습니다/);
    assert.match(privacy, /IndexedDB/);
    assert.match(privacy, /담당자\s*연락처/);
    assert.match(privacy, /로그아웃할 때\s*자동으로 지워집니다/);
  });
});
