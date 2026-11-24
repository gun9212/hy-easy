#!/usr/bin/env node
// Verifies that production PostgreSQL has every migration version in supabase/migrations/
// and every RPC function called by src/ before a web deployment goes live.
//
// Usage:
//   node scripts/check-prod-migrations.mjs --list
//   SUPABASE_DB_URL=postgres://... node scripts/check-prod-migrations.mjs
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIGRATION_PATTERN = /^(\d{12})_[a-z0-9_]+\.sql$/;
const RPC_CALL_PATTERN = /\.rpc\(\s*["']([a-zA-Z0-9_]+)["']/g;
const CREATE_FN_PATTERN = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)\s*\(/gi;

export function listMigrations(migrationsDir) {
  const files = readdirSync(migrationsDir)
    .filter(name => name.endsWith(".sql"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const seen = new Set();
  return files.map(file => {
    const match = MIGRATION_PATTERN.exec(file);
    if (!match) {
      throw new Error(`Invalid migration filename (expected YYYYMMDDNNNN_name.sql): ${file}`);
    }
    const version = match[1];
    if (seen.has(version)) {
      throw new Error(`Duplicate migration version prefix: ${version} (${file})`);
    }
    seen.add(version);
    return { file, version };
  });
}

function walkSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkSourceFiles(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

export function extractRpcCalls(sourceDir) {
  const rpcs = new Set();
  for (const file of walkSourceFiles(sourceDir)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(RPC_CALL_PATTERN)) {
      rpcs.add(match[1]);
    }
  }
  return [...rpcs].sort();
}

export function extractMigrationFunctions(migrationsDir) {
  const fns = new Set();
  for (const { file } of listMigrations(migrationsDir)) {
    const text = readFileSync(path.join(migrationsDir, file), "utf8");
    for (const match of text.matchAll(CREATE_FN_PATTERN)) {
      fns.add(match[1]);
    }
  }
  return [...fns].sort();
}

export function findMissingProdSchema({ expectedVersions, appliedVersions, expectedRpcs, existingRpcs }) {
  const appliedSet = new Set(appliedVersions);
  const existingSet = new Set(existingRpcs);
  return {
    missingVersions: expectedVersions.filter(v => !appliedSet.has(v)),
    missingRpcs: expectedRpcs.filter(fn => !existingSet.has(fn)),
  };
}

function queryLines(dbUrl, sql) {
  const output = execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const migrationsDir = path.join(rootDir, "supabase", "migrations");
  const srcDir = path.join(rootDir, "src");

  const migrations = listMigrations(migrationsDir);
  const expectedVersions = migrations.map(m => m.version);
  const expectedRpcs = extractRpcCalls(srcDir);

  if (process.argv.includes("--list")) {
    console.log(`Migrations (${expectedVersions.length}): ${expectedVersions.join(", ")}`);
    console.log(`Web RPCs (${expectedRpcs.length}): ${expectedRpcs.join(", ")}`);
    return;
  }

  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) {
    console.error("SUPABASE_DB_URL is required to verify production DB schema.");
    process.exit(2);
  }

  const hasHistoryTable =
    queryLines(dbUrl, "select to_regclass('supabase_migrations.schema_migrations') is not null")[0] === "t";
  const appliedVersions = hasHistoryTable
    ? queryLines(dbUrl, "select version from supabase_migrations.schema_migrations order by version")
    : [];
  const existingRpcs = queryLines(
    dbUrl,
    "select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1",
  );

  const { missingVersions, missingRpcs } = findMissingProdSchema({
    expectedVersions: hasHistoryTable ? expectedVersions : [],
    appliedVersions,
    expectedRpcs,
    existingRpcs,
  });

  if (missingVersions.length > 0 || missingRpcs.length > 0) {
    if (missingVersions.length > 0) {
      console.error(`Missing production migration versions: ${missingVersions.join(", ")}`);
    }
    if (missingRpcs.length > 0) {
      console.error(`Missing production public RPC functions: ${missingRpcs.join(", ")}`);
    }
    console.error(
      "Apply pending migrations in supabase/migrations/ to production Supabase before deploying the web app.",
    );
    process.exit(1);
  }

  console.log(
    hasHistoryTable
      ? `Production DB verified: all ${expectedVersions.length} migration versions and ${expectedRpcs.length} web RPCs are present.`
      : `Production DB verified: all ${expectedRpcs.length} web RPCs are present (supabase_migrations.schema_migrations table not present).`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
