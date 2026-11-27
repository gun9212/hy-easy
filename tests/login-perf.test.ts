import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const readSrc = (...segments: string[]) => readFileSync(path.join(process.cwd(), "src", ...segments), "utf8");

describe("login LCP/CLS and posting list INP guards (PERF-01, PERF-02, PERF-04)", () => {
  it("preconnects Google GSI origins, avoids opacity:0 hero hide, and passes initialNarrow on /login", () => {
    const loginPage = readSrc("app", "login", "page.tsx");
    const loginCss = readSrc("app", "login", "login.css");

    assert.match(loginPage, /preconnect\("https:\/\/accounts\.google\.com"\)/);
    assert.match(loginPage, /preconnect\("https:\/\/fonts\.gstatic\.com",\s*\{\s*crossOrigin:\s*"anonymous"\s*\}\)/);
    assert.match(loginPage, /isPhoneRequest\(\)/);
    assert.match(loginPage, /initialNarrow=\{initialNarrow\}/);

    const keyframes = loginCss.match(/@keyframes\s+landing-in\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(keyframes.length > 0, "expected @keyframes landing-in in login.css");
    assert.doesNotMatch(keyframes, /opacity\s*:\s*0/);
  });

  it("locks .google-button-slot to 44px height with overflow hidden to prevent GSI style-swap CLS", () => {
    const loginCss = readSrc("app", "login", "login.css");
    assert.match(loginCss, /\.landing-signin\s+\.google-button-slot\s*\{[^}]*height:\s*44px;[^}]*overflow:\s*hidden;/);
  });

  it("code-splits PostingsTable for phone requests and memoizes list components", () => {
    const results = readSrc("components", "workspace", "posting-results.tsx");
    const cards = readSrc("components", "workspace", "posting-cards.tsx");
    const view = readSrc("components", "workspace", "postings-view.tsx");
    const filters = readSrc("components", "workspace", "list-filters.tsx");
    const appChrome = readSrc("components", "workspace", "app-chrome.tsx");

    assert.match(results, /dynamic\(\(\)\s*=>\s*import\("\.\/postings-table"\)/);
    assert.match(results, /const showTable\s*=\s*!narrow\s*&&\s*wideContainer\s*!==\s*false/);
    assert.match(cards, /const PostingCard\s*=\s*memo\(/);
    assert.match(view, /export const PostingsView\s*=\s*memo\(/);
    assert.match(filters, /export const ListFilters\s*=\s*memo\(/);
    assert.match(appChrome, /export const AppSideNav\s*=\s*memo\(/);
  });
});
