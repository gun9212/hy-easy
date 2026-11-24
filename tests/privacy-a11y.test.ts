import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("privacy page mobile table accessibility", () => {
  it("provides focusable named scroll regions, captions, column labels, and mobile card stacking", () => {
    const page = readFileSync(path.join(process.cwd(), "src", "app", "privacy", "page.tsx"), "utf8");
    const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

    assert.match(page, /role="region"\s+aria-label=\{caption\}\s+tabIndex=\{0\}/);
    assert.match(page, /<caption className="sr-only">\{caption\}<\/caption>/);
    assert.match(page, /<th scope="col"/);
    assert.match(page, /data-label=\{head\[i\]\}/);
    assert.match(page, /caption="처리하는 개인정보와 목적"/);
    assert.match(page, /caption="개인정보 처리 위탁 및 국외 이전"/);

    assert.match(css, /\.policy-table-wrap:focus-visible/);
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.policy-table-wrap\s*\{[\s\S]*?overflow-x:\s*visible/);
    assert.match(css, /\.policy-table td::before\s*\{[\s\S]*?content:\s*attr\(data-label\)/);
  });
});
