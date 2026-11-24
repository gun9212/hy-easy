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

echo "Testing atomic public restore (backup/restore-public.sh)..."
DB_URL="$DB_URL" PUBLIC_DUMP="$WORK/public.dump" \
  PRIVILEGES_SQL="$ROOT_DIR/supabase/privileges.sql" \
  PRIVILEGES_TEST_SQL="$ROOT_DIR/tests/database-privileges.sql" \
  sh "$ROOT_DIR/backup/restore-public.sh"
psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$ROOT_DIR/tests/database-policies.sql" >/dev/null

echo "Testing single-snapshot backup (backup/run.sh) and strict restore drill (backup/restore-test.sh)..."
psql -v ON_ERROR_STOP=1 "$DB_URL" >/dev/null <<'SQL'
insert into auth.users(id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001', 'student@hanyang.ac.kr', now()),
  ('00000000-0000-4000-8000-000000000002', 'kept-admin@hanyang.ac.kr', now()),
  ('00000000-0000-4000-8000-000000000003', 'revoked-admin@hanyang.ac.kr', now());
insert into auth.identities(user_id, provider, identity_data) values
  ('00000000-0000-4000-8000-000000000001', 'google', '{"email":"student@hanyang.ac.kr","email_verified":true}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', 'google', '{"email":"kept-admin@hanyang.ac.kr","email_verified":true}'::jsonb),
  ('00000000-0000-4000-8000-000000000003', 'google', '{"email":"revoked-admin@hanyang.ac.kr","email_verified":true}'::jsonb);
insert into public.admins(user_id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
select public.sync_posting(
  '{"sourceId":"drill-1","company":"Drill Co","title":"Backend Intern","tasks":"SQL","recruitment":"open"}'::jsonb,
  'drill-hash-1',
  'drill-class-1'
);
insert into public.classification_overrides(posting_id, result, input_hash, editor_id)
  select id, '{"primaryRole":"개발"}'::jsonb, 'drill-class-1', '00000000-0000-4000-8000-000000000001'
  from public.postings where source_id = 'drill-1';
insert into public.classification_audit(posting_id, result, editor_id)
  select id, '{"primaryRole":"개발"}'::jsonb, '00000000-0000-4000-8000-000000000001'
  from public.postings where source_id = 'drill-1';
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

echo "Testing post-backup account deletion and admin revocation replay (backup/reconcile-restore.sh)..."
cat >"$WORK/post-backup-changes.json" <<'JSON'
[
  { "at": "2020-01-01T00:00:00Z", "action": "revoke_admin", "userId": "00000000-0000-4000-8000-000000000002" },
  { "at": "2099-01-01T00:00:00Z", "action": "revoke_admin", "userId": "00000000-0000-4000-8000-000000000003" },
  { "at": "2099-01-01T01:00:00Z", "action": "delete_user", "userId": "00000000-0000-4000-8000-000000000001" }
]
JSON
MANIFEST="$DRILL_DIR/manifest.json" LEDGER="$WORK/post-backup-changes.json" \
  sh "$ROOT_DIR/backup/reconcile-restore.sh" --dry-run
DB_URL="$DB_URL" MANIFEST="$DRILL_DIR/manifest.json" LEDGER="$WORK/post-backup-changes.json" \
  sh "$ROOT_DIR/backup/reconcile-restore.sh"
psql -v ON_ERROR_STOP=1 "$DB_URL" >/dev/null <<'SQL'
do $$ begin
  if (select count(*) from public.admins) <> 1
    or not exists (select 1 from public.admins where user_id = '00000000-0000-4000-8000-000000000002') then
    raise exception 'Expected only pre-backup admin 00000000-0000-4000-8000-000000000002 to remain';
  end if;
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'Expected post-backup deleted user to be removed';
  end if;
  if (select count(*) from public.classification_overrides where editor_id is null) <> 1
    or (select count(*) from public.classification_audit where editor_id is null) <> 1 then
    raise exception 'Expected classification override and audit to be preserved with null editor_id';
  end if;
end $$;
SQL
echo "Confirmed: reconcile-restore.sh replays post-backup deletions and admin revocations while preserving overrides/audit."
