#!/bin/sh
# Restore drill: loads a single-snapshot backup into a throwaway PostgreSQL instance and exits non-zero if
# role privileges, snapshot row counts (manifest.json), or required foreign-key/user references fail verification.
# Runs inside the backup image (see docs/BACKUP.md) or locally on PostgreSQL 15+. Never writes to live DB.
# Env:
#   DUMP_DIR             Folder containing public.dump, auth.dump, and manifest.json
#   SUPABASE_DB_URL      Live DB (read-only) to extract auth.users/auth.identities DDL, unless AUTH_SCHEMA_SQL is set
#   AUTH_SCHEMA_SQL      Optional SQL file creating auth schema + auth.users/auth.identities + auth.uid() (offline tests)
#   PRIVILEGES_SQL       Path to supabase/privileges.sql
#   PRIVILEGES_TEST_SQL  Path to tests/database-privileges.sql
set -eu
: "${DUMP_DIR:?}"
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PRIVILEGES_SQL="${PRIVILEGES_SQL:-$SCRIPT_DIR/../supabase/privileges.sql}"
PRIVILEGES_TEST_SQL="${PRIVILEGES_TEST_SQL:-$SCRIPT_DIR/../tests/database-privileges.sql}"
MANIFEST="$DUMP_DIR/manifest.json"

for req in "$DUMP_DIR/public.dump" "$DUMP_DIR/auth.dump" "$MANIFEST" "$PRIVILEGES_SQL" "$PRIVILEGES_TEST_SQL"; do
  [ -f "$req" ] || { echo "Missing required restore input: $req" >&2; exit 1; }
done
if [ -z "${AUTH_SCHEMA_SQL:-}" ] && [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Set SUPABASE_DB_URL (or AUTH_SCHEMA_SQL for offline drills)" >&2
  exit 1
fi

if [ -z "${PG_BIN:-}" ]; then
  if ! command -v initdb >/dev/null 2>&1 || ! command -v postgres >/dev/null 2>&1 || [ "$(postgres --version | awk '{print int($NF)}')" -lt 15 ]; then
    # Newest major first. Debian/Ubuntu install each major under /usr/lib/postgresql/<major>/bin, and CI runner images
    # move to new majors, so do not pin a list of versions.
    for candidate in $(ls -d /opt/homebrew/opt/postgresql@*/bin /usr/lib/postgresql/*/bin 2>/dev/null | sort -rV); do
      if [ -x "$candidate/postgres" ] && [ -x "$candidate/initdb" ]; then
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

WORK=$(mktemp -d)
PGDATA="$WORK/pgdata"
PGSOCK="$WORK/sock"
mkdir -p "$PGSOCK"
cleanup() {
  pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

initdb -D "$PGDATA" -U postgres >/dev/null
pg_ctl -D "$PGDATA" -o "-k $PGSOCK -c listen_addresses=''" -l "$WORK/pg.log" start >/dev/null
LOCAL="host=$PGSOCK user=postgres dbname=postgres"

# Supabase supplies these roles and the auth schema; a new Supabase project already has them.
if [ -n "${AUTH_SCHEMA_SQL:-}" ]; then
  psql -q "$LOCAL" -v ON_ERROR_STOP=1 -f "$AUTH_SCHEMA_SQL" >/dev/null
else
  psql -q "$LOCAL" -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
SQL
  pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges --table=auth.users --table=auth.identities |
    sed -e '/^CREATE SCHEMA auth;/d' >"$WORK/auth-schema.sql"
  psql -q "$LOCAL" -v ON_ERROR_STOP=1 -c 'create schema auth' \
    -c "create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('test.uid',true),'')::uuid \$\$"
  psql -q "$LOCAL" -f "$WORK/auth-schema.sql" >/dev/null 2>"$WORK/auth-schema.err" || true
  grep -c ERROR "$WORK/auth-schema.err" | sed 's/^/auth schema errors (types, indexes the drill does not need): /' || true
fi

pg_restore --no-owner --data-only -d "$LOCAL" "$DUMP_DIR/auth.dump"
# 1. Atomically restore public schema + canonical REVOKE/GRANT rules, then verify effective privileges.
if [ -f "$SCRIPT_DIR/restore-public.sh" ]; then
  DB_URL="$LOCAL" PUBLIC_DUMP="$DUMP_DIR/public.dump" \
    PRIVILEGES_SQL="$PRIVILEGES_SQL" PRIVILEGES_TEST_SQL="$PRIVILEGES_TEST_SQL" \
    sh "$SCRIPT_DIR/restore-public.sh"
else
  {
    printf 'DROP SCHEMA IF EXISTS public CASCADE;\n'
    pg_restore --no-owner --no-privileges --file=- "$DUMP_DIR/public.dump"
    sed -e '/^[[:space:]]*[Bb][Ee][Gg][Ii][Nn];[[:space:]]*$/d' \
        -e '/^[[:space:]]*[Cc][Oo][Mm][Mm][Ii][Tt];[[:space:]]*$/d' \
        "$PRIVILEGES_SQL"
  } | psql "$LOCAL" --single-transaction -v ON_ERROR_STOP=1 -q >/dev/null
  psql -v ON_ERROR_STOP=1 "$LOCAL" -f "$PRIVILEGES_TEST_SQL"
fi

# 2. Verify restored row counts match the snapshot manifest recorded at backup time.
COUNT_SQL="SELECT 'auth.users', count(*) FROM auth.users
  UNION ALL SELECT 'auth.identities', count(*) FROM auth.identities
  UNION ALL SELECT 'public.companies', count(*) FROM public.companies
  UNION ALL SELECT 'public.postings', count(*) FROM public.postings
  UNION ALL SELECT 'public.classifications', count(*) FROM public.classifications
  UNION ALL SELECT 'public.classification_calls', count(*) FROM public.classification_calls
  UNION ALL SELECT 'public.favorites', count(*) FROM public.favorites
  UNION ALL SELECT 'public.applications', count(*) FROM public.applications
  UNION ALL SELECT 'public.application_events', count(*) FROM public.application_events
  UNION ALL SELECT 'public.admins', count(*) FROM public.admins
  UNION ALL SELECT 'public.feedback', count(*) FROM public.feedback
  UNION ALL SELECT 'public.activity_days', count(*) FROM public.activity_days
  ORDER BY 1"

psql -X -v ON_ERROR_STOP=1 -At -F '|' "$LOCAL" -c "$COUNT_SQL" >"$WORK/restored.tsv"
jq -er '.counts | to_entries | sort_by(.key)[] | "\(.key)|\(.value)"' "$MANIFEST" >"$WORK/expected.tsv"

FAILURES=0
echo "table | expected (snapshot) | restored | status"
while IFS='|' read -r tbl expected; do
  restored=$(awk -F'|' -v k="$tbl" '$1 == k { print $2 }' "$WORK/restored.tsv")
  if [ "$restored" = "$expected" ]; then
    printf '%s | %s | %s | OK\n' "$tbl" "$expected" "$restored"
  else
    printf '%s | %s | %s | MISMATCH\n' "$tbl" "$expected" "${restored:-missing}" >&2
    FAILURES=$((FAILURES + 1))
  fi
done <"$WORK/expected.tsv"

# 3. Verify required cross-schema and intra-schema references have zero orphan rows.
ORPHAN_SQL="SELECT 'auth.identities -> auth.users', count(*) FROM auth.identities i LEFT JOIN auth.users u ON u.id = i.user_id WHERE u.id IS NULL
  UNION ALL SELECT 'public.favorites -> auth.users', count(*) FROM public.favorites f LEFT JOIN auth.users u ON u.id = f.user_id WHERE u.id IS NULL
  UNION ALL SELECT 'public.applications -> auth.users', count(*) FROM public.applications a LEFT JOIN auth.users u ON u.id = a.user_id WHERE u.id IS NULL
  UNION ALL SELECT 'public.application_events -> auth.users', count(*) FROM public.application_events e LEFT JOIN auth.users u ON u.id = e.user_id WHERE u.id IS NULL
  UNION ALL SELECT 'public.admins -> auth.users', count(*) FROM public.admins a LEFT JOIN auth.users u ON u.id = a.user_id WHERE u.id IS NULL
  UNION ALL SELECT 'public.activity_days -> auth.users', count(*) FROM public.activity_days d LEFT JOIN auth.users u ON u.id = d.user_id WHERE u.id IS NULL
  UNION ALL SELECT 'public.classification_overrides -> auth.users (non-null)', count(*) FROM public.classification_overrides o LEFT JOIN auth.users u ON u.id = o.editor_id WHERE o.editor_id IS NOT NULL AND u.id IS NULL
  UNION ALL SELECT 'public.classification_audit -> auth.users (non-null)', count(*) FROM public.classification_audit a LEFT JOIN auth.users u ON u.id = a.editor_id WHERE a.editor_id IS NOT NULL AND u.id IS NULL
  UNION ALL SELECT 'public.postings -> public.companies', count(*) FROM public.postings p LEFT JOIN public.companies c ON c.id = p.company_id WHERE c.id IS NULL
  UNION ALL SELECT 'public.classifications -> public.postings', count(*) FROM public.classifications cl LEFT JOIN public.postings p ON p.id = cl.posting_id WHERE p.id IS NULL
  UNION ALL SELECT 'public.favorites -> public.postings', count(*) FROM public.favorites f LEFT JOIN public.postings p ON p.id = f.posting_id WHERE p.id IS NULL
  UNION ALL SELECT 'public.applications -> public.postings', count(*) FROM public.applications a LEFT JOIN public.postings p ON p.id = a.posting_id WHERE p.id IS NULL
  ORDER BY 1"

psql -X -v ON_ERROR_STOP=1 -At -F '|' "$LOCAL" -c "$ORPHAN_SQL" >"$WORK/orphans.tsv"
echo "relation | orphans | status"
while IFS='|' read -r rel count; do
  if [ "$count" -eq 0 ]; then
    printf '%s | %s | OK\n' "$rel" "$count"
  else
    printf '%s | %s | FAIL\n' "$rel" "$count" >&2
    FAILURES=$((FAILURES + 1))
  fi
done <"$WORK/orphans.tsv"

if [ "$FAILURES" -gt 0 ]; then
  echo "Restore drill FAILED with $FAILURES check failure(s)." >&2
  exit 1
fi
echo "Restore drill PASSED: privileges, snapshot row counts, and referential integrity verified."
