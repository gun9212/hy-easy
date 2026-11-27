import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const readRepo = (...segments: string[]) => readFileSync(path.join(process.cwd(), ...segments), "utf8");

describe("infrastructure and CI hardening guards (INFRA-02, INFRA-03, INFRA-05, INFRA-07)", () => {
  it("pins every GitHub Actions uses: reference in ci.yml to a 40-char commit SHA", () => {
    const ci = readRepo(".github", "workflows", "ci.yml");
    const usesLines = ci
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.startsWith("- uses:") || l.startsWith("uses:"));
    assert.ok(usesLines.length >= 10, `expected >= 10 uses lines, got ${usesLines.length}`);
    for (const line of usesLines) {
      assert.match(line, /@[0-9a-f]{40}\b/, `unpinned action in ci.yml: ${line}`);
    }
  });

  it("enforces uniform bucket access, public access prevention, and lifecycle deletion on Cloud Build staging bucket", () => {
    const tf = readRepo("infra", "github-deploy.tf");
    assert.match(
      tf,
      /resource\s+"google_storage_bucket"\s+"cloudbuild"\s*\{[\s\S]*?uniform_bucket_level_access\s*=\s*true/,
    );
    assert.match(
      tf,
      /resource\s+"google_storage_bucket"\s+"cloudbuild"\s*\{[\s\S]*?public_access_prevention\s*=\s*"enforced"/,
    );
    assert.match(
      tf,
      /resource\s+"google_storage_bucket"\s+"cloudbuild"\s*\{[\s\S]*?lifecycle_rule\s*\{[\s\S]*?type\s*=\s*"Delete"/,
    );
  });

  it("enables deletion protection on backup Cloud Run job and retry_count = 1 on collector schedules", () => {
    const mainTf = readRepo("infra", "main.tf");
    const backupTf = readRepo("infra", "backup.tf");
    assert.match(backupTf, /resource\s+"google_cloud_run_v2_job"\s+"backup"[\s\S]*?deletion_protection\s*=\s*true/);
    assert.match(mainTf, /resource\s+"google_cloud_scheduler_job"\s+"poll"[\s\S]*?retry_count\s*=\s*1/);
  });

  it("includes migration revoking PUBLIC and anon EXECUTE from is_admin and is_school_user", () => {
    const sql = readRepo("supabase", "migrations", "202611270001_revoke_anon_helper_exec.sql");
    assert.match(
      sql,
      /revoke\s+execute\s+on\s+function\s+public\.is_admin\(\),\s*public\.is_school_user\(\)\s+from\s+public,\s*anon;/i,
    );
  });
});
