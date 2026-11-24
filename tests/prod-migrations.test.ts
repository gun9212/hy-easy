import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  extractMigrationFunctions,
  extractRpcCalls,
  findMissingProdSchema,
  listMigrations,
} from "../scripts/check-prod-migrations.mjs";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

describe("database migration and production RPC checks", () => {
  it("lists all migrations in sortable filename order with unique 12-digit versions", () => {
    const migrations = listMigrations(MIGRATIONS_DIR);
    assert.ok(migrations.length >= 9);
    const files = migrations.map(m => m.file);
    assert.deepEqual(files, [...files].sort());
  });

  it("every RPC called by src/ and worker/ is defined in migrations and granted in supabase/privileges.sql", () => {
    const defined = new Set(extractMigrationFunctions(MIGRATIONS_DIR));
    const privilegesSql = readFileSync(path.join(ROOT, "supabase", "privileges.sql"), "utf8");
    const webRpcs = extractRpcCalls(path.join(ROOT, "src"));
    const workerRpcs = extractRpcCalls(path.join(ROOT, "worker"));

    assert.ok(webRpcs.includes("delete_application"));
    assert.ok(webRpcs.includes("is_school_user"));
    assert.ok(workerRpcs.includes("sync_posting"));

    for (const rpc of [...webRpcs, ...workerRpcs]) {
      assert.ok(defined.has(rpc), `RPC "${rpc}" is called in code but missing from supabase/migrations/`);
      assert.ok(
        privilegesSql.includes(`public.${rpc}(`),
        `RPC "${rpc}" is missing from supabase/privileges.sql restore grants`,
      );
    }
  });

  it("detects missing production migration versions and missing RPCs before deploy", () => {
    const missing = findMissingProdSchema({
      expectedVersions: ["202611100001", "202611230004"],
      appliedVersions: ["202611100001"],
      expectedRpcs: ["is_school_user", "delete_application"],
      existingRpcs: ["is_school_user"],
    });
    assert.deepEqual(missing, {
      missingVersions: ["202611230004"],
      missingRpcs: ["delete_application"],
    });

    const synced = findMissingProdSchema({
      expectedVersions: ["202611100001", "202611230004"],
      appliedVersions: ["202611100001", "202611230004"],
      expectedRpcs: ["is_school_user", "delete_application"],
      existingRpcs: ["is_school_user", "delete_application"],
    });
    assert.deepEqual(synced, { missingVersions: [], missingRpcs: [] });
  });

  it("CI runs scripts/verify-db.sh instead of a hardcoded migration list and checks prod RPCs before deploy", () => {
    const ci = readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
    assert.match(ci, /scripts\/verify-db\.sh/);
    assert.doesNotMatch(ci, /202611100001_initial\.sql/);
    assert.match(ci, /scripts\/check-prod-migrations\.mjs/);
  });
});
