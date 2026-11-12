#!/bin/sh
# Restore drill: loads a backup into a throwaway Postgres 17 and compares row counts with the live database.
# Runs inside the backup image (see docs/BACKUP.md). Reads the live database, never writes to it.
# Env: SUPABASE_DB_URL (live, read-only use), DUMP_DIR (folder with public.dump and auth.dump).
set -eu
: "${SUPABASE_DB_URL:?}" "${DUMP_DIR:?}"

PGDATA=$(mktemp -d)
initdb -D "$PGDATA" -U postgres >/dev/null
pg_ctl -D "$PGDATA" -o "-k /tmp -c listen_addresses=''" -l "$PGDATA/log" start >/dev/null
LOCAL="host=/tmp user=postgres dbname=postgres"

# Supabase supplies these roles and the auth schema; a new Supabase project already has them.
psql -q "$LOCAL" -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
SQL
# auth table definitions come from the live database (schema only), standing in for what Supabase creates.
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges --table=auth.users --table=auth.identities |
  sed -e '/^CREATE SCHEMA auth;/d' >"$PGDATA/auth-schema.sql"
psql -q "$LOCAL" -c 'create schema auth' -c "create function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$"
psql -q "$LOCAL" -f "$PGDATA/auth-schema.sql" >/dev/null 2>"$PGDATA/auth-schema.err" || true
grep -c ERROR "$PGDATA/auth-schema.err" | sed 's/^/auth schema errors (types, indexes the drill does not need): /' || true

pg_restore --no-owner --data-only -d "$LOCAL" "$DUMP_DIR/auth.dump"
# The dump recreates the public schema itself.
psql -q "$LOCAL" -c "drop schema public cascade"
pg_restore --no-owner --no-privileges -d "$LOCAL" "$DUMP_DIR/public.dump"

COUNT_SQL="select 'auth.users', count(*) from auth.users union all select 'auth.identities', count(*) from auth.identities
  union all select 'postings', count(*) from public.postings union all select 'classifications', count(*) from public.classifications
  union all select 'favorites', count(*) from public.favorites union all select 'applications', count(*) from public.applications
  union all select 'admins', count(*) from public.admins order by 1"
echo "table | restored | live"
psql -At "$LOCAL" -c "$COUNT_SQL" >"$PGDATA/restored"
psql -At "$SUPABASE_DB_URL" -c "$COUNT_SQL" >"$PGDATA/live"
cut -d"|" -f2 "$PGDATA/live" | paste -d"|" "$PGDATA/restored" -
echo "orphan favorites/applications (must be 0):"
psql -At "$LOCAL" -c "select count(*) from public.favorites f left join auth.users u on u.id = f.user_id where u.id is null" \
  -c "select count(*) from public.applications a left join auth.users u on u.id = a.user_id where u.id is null"
pg_ctl -D "$PGDATA" stop >/dev/null
