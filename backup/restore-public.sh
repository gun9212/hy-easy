#!/bin/sh
# Atomically restores the public schema and reapplies canonical REVOKE/GRANT privileges inside a single
# PostgreSQL transaction so collector SECURITY DEFINER functions are never exposed to PUBLIC/anon/authenticated
# between pg_restore and privileges.sql, then verifies effective schema, RLS, table, and function privileges.
#
# Usage:
#   DB_URL="$DB_URL" PUBLIC_DUMP="restore/public.dump" sh backup/restore-public.sh
set -eu

: "${DB_URL:?Set DB_URL to the target PostgreSQL connection string}"
: "${PUBLIC_DUMP:?Set PUBLIC_DUMP to the path of public.dump}"

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PRIVILEGES_SQL="${PRIVILEGES_SQL:-$SCRIPT_DIR/../supabase/privileges.sql}"
PRIVILEGES_TEST_SQL="${PRIVILEGES_TEST_SQL:-$SCRIPT_DIR/../tests/database-privileges.sql}"

for req in "$PUBLIC_DUMP" "$PRIVILEGES_SQL" "$PRIVILEGES_TEST_SQL"; do
  [ -f "$req" ] || { echo "Missing required restore file: $req" >&2; exit 1; }
done

{
  printf 'DROP SCHEMA IF EXISTS public CASCADE;\n'
  pg_restore --no-owner --no-privileges --file=- "$PUBLIC_DUMP"
  # Strip outer BEGIN/COMMIT from privileges.sql because psql --single-transaction wraps the entire stream.
  sed -e '/^[[:space:]]*[Bb][Ee][Gg][Ii][Nn];[[:space:]]*$/d' \
      -e '/^[[:space:]]*[Cc][Oo][Mm][Mm][Ii][Tt];[[:space:]]*$/d' \
      "$PRIVILEGES_SQL"
} | psql "$DB_URL" --single-transaction -v ON_ERROR_STOP=1 -q >/dev/null

psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$PRIVILEGES_TEST_SQL"
echo "Atomic public restore and effective privilege verification PASSED."
