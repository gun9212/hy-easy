#!/bin/sh
# Replays account deletions and admin revocations recorded outside the database after a backup snapshot
# was taken, so restoring an older backup never resurrects deleted accounts or revoked admin privileges.
#
# Usage:
#   DB_URL="$DB_URL" MANIFEST="restore/manifest.json" LEDGER="post-backup-changes.json" \
#     sh backup/reconcile-restore.sh [--dry-run]
#
# LEDGER format (JSON array kept outside the DB):
#   [
#     { "at": "2026-11-24T01:00:00Z", "action": "revoke_admin", "userId": "00000000-0000-4000-8000-000000000002" },
#     { "at": "2026-11-24T02:00:00Z", "action": "delete_user",  "userId": "00000000-0000-4000-8000-000000000001" }
#   ]
set -eu

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
elif [ -n "${1:-}" ]; then
  echo "Usage: DB_URL=... MANIFEST=... LEDGER=... sh backup/reconcile-restore.sh [--dry-run]" >&2
  exit 1
fi

: "${MANIFEST:?Set MANIFEST to the restored backup manifest.json}"
: "${LEDGER:?Set LEDGER to the out-of-band post-backup changes JSON file}"
if [ "$DRY_RUN" -eq 0 ]; then
  : "${DB_URL:?Set DB_URL to the restored PostgreSQL connection string}"
fi

[ -f "$MANIFEST" ] || { echo "Missing manifest: $MANIFEST" >&2; exit 1; }
[ -f "$LEDGER" ] || { echo "Missing change ledger: $LEDGER" >&2; exit 1; }

SNAPSHOT_AT=$(jq -er '
  .createdAt
  | select(type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$"))
' "$MANIFEST") || { echo "Invalid createdAt timestamp in $MANIFEST" >&2; exit 1; }

# Validate every ledger record strictly before generating SQL.
jq -e '
  type == "array" and all(.[];
    type == "object"
    and (.at | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$"))
    and (.action == "delete_user" or .action == "revoke_admin")
    and (.userId | type == "string" and test("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"))
  )
' "$LEDGER" >/dev/null || { echo "Invalid ledger entry format in $LEDGER" >&2; exit 1; }

WORK=$(mktemp -d)
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

jq -r --arg snap "$SNAPSHOT_AT" '
  def to_epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
  ($snap | to_epoch) as $cutoff
  | map(select((.at | to_epoch) >= $cutoff))
  | sort_by(.at)
  | .[]
  | "\(.at)|\(.action)|\(.userId | ascii_downcase)"
' "$LEDGER" >"$WORK/pending.tsv"

COUNT=$(sed '/^$/d' "$WORK/pending.tsv" | wc -l | tr -d ' ')
echo "Snapshot baseline: $SNAPSHOT_AT ($COUNT post-backup change(s) to replay)"

if [ "$COUNT" -eq 0 ]; then
  echo "No post-backup deletions or admin revocations to replay."
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run (no database changes applied):"
  while IFS='|' read -r at action uid; do
    [ -n "$action" ] || continue
    printf '  - %s | %s | %s\n' "$at" "$action" "$uid"
  done <"$WORK/pending.tsv"
  exit 0
fi

SQL_FILE="$WORK/reconcile.sql"
{
  echo "BEGIN;"
  echo "CREATE FUNCTION pg_temp.assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS \$\$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'RECONCILE ASSERTION FAILED: %', msg; END IF; END \$\$;"
  while IFS='|' read -r at action uid; do
    [ -n "$action" ] || continue
    if [ "$action" = "revoke_admin" ]; then
      printf "DELETE FROM public.admins WHERE user_id = '%s'::uuid;\n" "$uid"
      printf "SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.admins WHERE user_id = '%s'::uuid), 'revoked admin still present: %s');\n" "$uid" "$uid"
    elif [ "$action" = "delete_user" ]; then
      printf "DELETE FROM auth.identities WHERE user_id = '%s'::uuid;\n" "$uid"
      printf "DELETE FROM auth.users WHERE id = '%s'::uuid;\n" "$uid"
      printf "SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '%s'::uuid), 'deleted user still in auth.users: %s');\n" "$uid" "$uid"
      printf "SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = '%s'::uuid), 'deleted user still in auth.identities: %s');\n" "$uid" "$uid"
      printf "SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.admins WHERE user_id = '%s'::uuid), 'deleted user still in public.admins: %s');\n" "$uid" "$uid"
    fi
  done <"$WORK/pending.tsv"
  echo "COMMIT;"
} >"$SQL_FILE"

psql -v ON_ERROR_STOP=1 -q "$DB_URL" -f "$SQL_FILE" >/dev/null
echo "Reconciliation PASSED: replayed $COUNT post-backup change(s) atomically."
