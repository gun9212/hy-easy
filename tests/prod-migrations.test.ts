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

  it("detects missing production migrations by name and missing RPCs before deploy", () => {
    const missing = findMissingProdSchema({
      expectedNames: ["initial", "feedback", "delete_application"],
      appliedNames: ["initial", "feedback"],
      expectedRpcs: ["is_school_user", "delete_application"],
      existingRpcs: ["is_school_user"],
    });
    assert.deepEqual(missing, {
      missingMigrations: ["delete_application"],
      missingRpcs: ["delete_application"],
    });

    // History recorded under unrelated names: nothing matches, so every file is reported rather than passing silently.
    assert.deepEqual(
      findMissingProdSchema({ expectedNames: ["initial"], appliedNames: ["other"], expectedRpcs: [], existingRpcs: [] })
        .missingMigrations,
      ["initial"],
    );
  });

  it("accepts production history as recorded: applied-at versions and a baseline applied before history began", () => {
    const expectedNames = listMigrations(MIGRATIONS_DIR).map(m => m.name);
    // Production on 2026-11-24: the first four files were applied before migration history was kept, and the rest are
    // recorded with the time they were applied (20261120003321 rls_initplan … 20261123143000 delete_application).
    const appliedNames = ["rls_initplan", "feedback", "admin_user_stats", "usage_daily", "delete_application"];
    assert.deepEqual(
      findMissingProdSchema({ expectedNames, appliedNames, expectedRpcs: [], existingRpcs: [] }).missingMigrations,
      [],
    );
    // A new file after the recorded ones that production has not applied yet is caught.
    assert.deepEqual(
      findMissingProdSchema({
        expectedNames: [...expectedNames, "next_change"],
        appliedNames,
        expectedRpcs: [],
        existingRpcs: [],
      }).missingMigrations,
      ["next_change"],
    );
  });

  it("CI runs scripts/verify-db.sh instead of a hardcoded migration list and checks prod RPCs before deploy", () => {
    const ci = readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
    assert.match(ci, /scripts\/verify-db\.sh/);
    assert.doesNotMatch(ci, /202611100001_initial\.sql/);
    assert.match(ci, /scripts\/check-prod-migrations\.mjs/);
  });
});
