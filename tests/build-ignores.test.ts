import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function patternsOf(file: string): string[] {
  return readFileSync(resolve(ROOT, file), "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function isIgnored(patterns: string[], relPath: string): boolean {
  const basename = relPath.split("/").at(-1) ?? relPath;
  return patterns.some(pattern => {
    if (pattern.includes("/")) return globToRegex(pattern).test(relPath);
    return globToRegex(pattern).test(basename) || globToRegex(pattern).test(relPath);
  });
}

describe("Cloud Build, Docker, and Git ignore rules", () => {
  for (const file of [".gcloudignore", ".dockerignore", ".gitignore"]) {
    it(`${file} excludes generated gha-creds-*.json files`, () => {
      const patterns = patternsOf(file);
      assert.equal(isIgnored(patterns, "gha-creds-0123456789abcdef.json"), true);
      assert.equal(isIgnored(patterns, "nested/gha-creds-0123456789abcdef.json"), true);
    });
  }
});
