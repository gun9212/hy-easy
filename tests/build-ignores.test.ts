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
  const normalized = pattern.replace(/\/+$/, "");
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\/\*\*/g, "(?:/.*)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function isIgnored(patterns: string[], relPath: string): boolean {
  const segments = relPath.split("/");
  const basename = segments.at(-1) ?? relPath;
  const prefixes = segments.slice(0, -1).map((_, idx) => segments.slice(0, idx + 1).join("/"));
  return patterns.some(raw => {
    if (raw.startsWith("!")) return false;
    const pattern = raw.replace(/\/+$/, "");
    const re = globToRegex(pattern);
    if (pattern.includes("/")) {
      return re.test(relPath) || prefixes.some(prefix => re.test(prefix));
    }
    return re.test(basename) || re.test(relPath) || segments.slice(0, -1).some(seg => re.test(seg));
  });
}

describe("Cloud Build, Docker, Vercel, and Git ignore rules", () => {
  for (const file of [".gcloudignore", ".dockerignore", ".gitignore", ".vercelignore"]) {
    it(`${file} excludes generated gha-creds-*.json files`, () => {
      const patterns = patternsOf(file);
      assert.equal(isIgnored(patterns, "gha-creds-0123456789abcdef.json"), true);
      assert.equal(isIgnored(patterns, "nested/gha-creds-0123456789abcdef.json"), true);
    });

    it(`${file} excludes private evaluation snapshots and local restore dumps`, () => {
      const patterns = patternsOf(file);
      assert.equal(isIgnored(patterns, "evals/classification-golden.json"), true);
      assert.equal(isIgnored(patterns, "evals/classification-holdout.json"), true);
      assert.equal(isIgnored(patterns, "restore/auth.dump"), true);
      assert.equal(isIgnored(patterns, "restore/public.dump"), true);
      assert.equal(isIgnored(patterns, "restore/manifest.json"), true);
      assert.equal(isIgnored(patterns, "public.dump"), true);
      assert.equal(isIgnored(patterns, "tmp/public.dump"), true);
      assert.equal(isIgnored(patterns, ".secrets/hywep-state.json"), true);
      assert.equal(isIgnored(patterns, "infra/hy-easy.tfvars"), true);
      assert.equal(isIgnored(patterns, "infra/terraform.tfstate"), true);
    });
  }

  it("manual Cloud Build deploy script and CI run upload inspection before submitting", () => {
    const deployScript = readFileSync(resolve(ROOT, "scripts/deploy-collector.sh"), "utf8");
    const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
    assert.match(deployScript, /scripts\/check-cloudbuild-upload\.sh[\s\S]*gcloud builds submit/);
    assert.match(ci, /scripts\/check-cloudbuild-upload\.sh/);
  });
});
