#!/usr/bin/env bash
# Verifies every migration in supabase/migrations/ in filename order, runs RLS/policy and role-privilege tests,
# and verifies the backup/restore privilege flow (pg_dump --no-privileges -> pg_restore -> supabase/privileges.sql).
#
# Usage:
#   scripts/verify-db.sh                # spins up a disposable local PostgreSQL instance
#   scripts/verify-db.sh "dbname=test"  # runs against an existing empty database (e.g. in CI as user postgres)
set -euo pipefail

ROOT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
DB_URL="${1:-}"
WORK=$(mktemp -d)
PGDATA=""

# Migrations use `security_invoker = true` (PostgreSQL 15+). When running locally without DB_URL,
# prefer PostgreSQL 15+ if an older Homebrew formula is first on PATH.
if [ -z "$DB_URL" ] && [ -z "${PG_BIN:-}" ]; then
  if ! command -v postgres >/dev/null 2>&1 || [ "$(postgres --version | awk '{print int($NF)}')" -lt 15 ]; then
    for candidate in /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@15/bin; do
      if [ -x "$candidate/postgres" ]; then
        PG_BIN="$candidate"
        break
      fi
    done
  fi
fi
if [ -n "${PG_BIN:-}" ]; then
  PATH="$PG_BIN:$PATH"
  export PATH
fi

cleanup() {
  if [ -n "$PGDATA" ]; then
    pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

if [ -z "$DB_URL" ]; then
  PGDATA="$WORK/pgdata"
  initdb -D "$PGDATA" -U postgres >/dev/null
  pg_ctl -D "$PGDATA" -o "-k $WORK -c listen_addresses=''" -l "$WORK/pg.log" start >/dev/null
  DB_URL="host=$WORK user=postgres dbname=postgres"
fi

MIGRATIONS=()
while IFS= read -r migration; do
  MIGRATIONS+=("$migration")
done < <(LC_ALL=C find "$ROOT_DIR/supabase/migrations" -maxdepth 1 -name '*.sql' | LC_ALL=C sort)
if [ "${#MIGRATIONS[@]}" -eq 0 ]; then
  echo "No migration files found under supabase/migrations/" >&2
  exit 1
fi

echo "Applying bootstrap and ${#MIGRATIONS[@]} migrations in order:"
psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$ROOT_DIR/tests/database-bootstrap.sql" >/dev/null
for migration in "${MIGRATIONS[@]}"; do
  echo "  - $(basename "$migration")"
  psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$migration" >/dev/null
done

echo "Checking policies and role privileges after fresh migrations..."
psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$ROOT_DIR/tests/database-policies.sql"
psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$ROOT_DIR/tests/database-privileges.sql"

echo "Simulating pg_dump/pg_restore --no-owner --no-privileges..."
pg_dump "$DB_URL" --format=custom --no-owner --no-privileges --schema=public --file="$WORK/public.dump"
psql -v ON_ERROR_STOP=1 "$DB_URL" -c "drop schema public cascade" >/dev/null
pg_restore --no-owner --no-privileges -d "$DB_URL" "$WORK/public.dump"

if psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$ROOT_DIR/tests/database-privileges.sql" >/dev/null 2>&1; then
  echo "Expected privilege check to fail before applying supabase/privileges.sql" >&2
  exit 1
fi
echo "Confirmed: privilege check fails before supabase/privileges.sql is applied."

echo "Applying supabase/privileges.sql and re-checking restored DB..."
psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$ROOT_DIR/supabase/privileges.sql" >/dev/null
psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$ROOT_DIR/tests/database-privileges.sql"
psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$ROOT_DIR/tests/database-policies.sql"

echo "Testing single-snapshot backup (backup/run.sh) and strict restore drill (backup/restore-test.sh)..."
psql -v ON_ERROR_STOP=1 "$DB_URL" >/dev/null <<'SQL'
insert into auth.users(id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001', 'student@hanyang.ac.kr', now());
insert into auth.identities(user_id, provider, identity_data) values
  ('00000000-0000-4000-8000-000000000001', 'google', '{"email":"student@hanyang.ac.kr","email_verified":true}'::jsonb);
insert into public.admins(user_id) values ('00000000-0000-4000-8000-000000000001');
select public.sync_posting(
  '{"sourceId":"drill-1","company":"Drill Co","title":"Backend Intern","tasks":"SQL","recruitment":"open"}'::jsonb,
  'drill-hash-1',
  'drill-class-1'
);
insert into public.favorites(user_id, posting_id)
  select '00000000-0000-4000-8000-000000000001', id from public.postings where source_id = 'drill-1';
insert into public.feedback(message, page) values ('복구 연습 피드백', '/postings');
insert into public.activity_days(user_id, day) values ('00000000-0000-4000-8000-000000000001', current_date);
SQL

DRILL_DIR="$WORK/backup-drill"
SUPABASE_DB_URL="$DB_URL" BACKUP_OUT_DIR="$DRILL_DIR" sh "$ROOT_DIR/backup/run.sh"
DUMP_DIR="$DRILL_DIR" AUTH_SCHEMA_SQL="$ROOT_DIR/tests/database-bootstrap.sql" \
  PRIVILEGES_SQL="$ROOT_DIR/supabase/privileges.sql" \
  PRIVILEGES_TEST_SQL="$ROOT_DIR/tests/database-privileges.sql" \
  sh "$ROOT_DIR/backup/restore-test.sh"

# Negative test: a row-count mismatch in manifest.json must make restore-test.sh fail non-zero.
cp "$DRILL_DIR/manifest.json" "$WORK/manifest.orig.json"
jq '.counts["public.postings"] += 1' "$WORK/manifest.orig.json" >"$DRILL_DIR/manifest.json"
if DUMP_DIR="$DRILL_DIR" AUTH_SCHEMA_SQL="$ROOT_DIR/tests/database-bootstrap.sql" \
  PRIVILEGES_SQL="$ROOT_DIR/supabase/privileges.sql" \
  PRIVILEGES_TEST_SQL="$ROOT_DIR/tests/database-privileges.sql" \
  sh "$ROOT_DIR/backup/restore-test.sh" >/dev/null 2>&1; then
  echo "Expected restore-test.sh to fail when manifest.json row counts do not match" >&2
  exit 1
fi
mv "$WORK/manifest.orig.json" "$DRILL_DIR/manifest.json"
echo "Confirmed: restore-test.sh exits non-zero on snapshot count mismatch."
