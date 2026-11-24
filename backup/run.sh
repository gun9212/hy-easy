#!/bin/sh
# Dumps the database from a single PostgreSQL REPEATABLE READ snapshot and uploads it to the private backup bucket.
# See docs/BACKUP.md for what is kept and how to restore.
#   public.dump    schema + data of the public schema (postings, classifications, favorites, applications, admins, ...)
#   auth.dump      data of auth.users and auth.identities from the exact same snapshot
#   manifest.json  snapshot-consistent table row counts used as the verification baseline by backup/restore-test.sh
# Env:
#   SUPABASE_DB_URL  Secret Manager session-pooler connection string (port 5432)
#   BACKUP_BUCKET    GCS bucket name (required unless BACKUP_OUT_DIR is set for local/CI drill testing)
#   BACKUP_OUT_DIR   Optional local directory instead of GCS upload (writes dumps + manifest.json there)
# Each run writes a new folder; the service account can create objects but not read, overwrite or delete them.
set -eu

log() {
  # One JSON line per run outcome; Cloud Logging turns it into the hy_easy_backup_runs metric.
  printf '{"severity":"%s","event":"backup","status":"%s","message":"%s"}\n' "$1" "$2" "$3"
}

fail() {
  log ERROR failed "$1"
  exit 1
}

[ -n "${SUPABASE_DB_URL:-}" ] || fail "SUPABASE_DB_URL is not set"
if [ -z "${BACKUP_OUT_DIR:-}" ] && [ -z "${BACKUP_BUCKET:-}" ]; then
  fail "BACKUP_BUCKET is not set"
fi

STAMP=$(TZ=Asia/Seoul date +%Y-%m-%d_%H%M)
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
WORK=$(mktemp -d)
SNAP_PID=""
SNAP_OPEN=0

close_snapshot() {
  if [ "$SNAP_OPEN" -eq 1 ]; then
    printf 'COMMIT;\n\\q\n' >&3 2>/dev/null || true
    exec 3>&- 2>/dev/null || true
    exec 4<&- 2>/dev/null || true
    SNAP_OPEN=0
  fi
  if [ -n "$SNAP_PID" ]; then
    wait "$SNAP_PID" 2>/dev/null || true
    SNAP_PID=""
  fi
}

cleanup() {
  if [ "$SNAP_OPEN" -eq 1 ]; then
    printf 'ROLLBACK;\n\\q\n' >&3 2>/dev/null || true
    exec 3>&- 2>/dev/null || true
    exec 4<&- 2>/dev/null || true
    SNAP_OPEN=0
  fi
  if [ -n "$SNAP_PID" ]; then
    kill "$SNAP_PID" 2>/dev/null || true
    wait "$SNAP_PID" 2>/dev/null || true
    SNAP_PID=""
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# Hold one REPEATABLE READ READ ONLY transaction open so manifest.json, public.dump, and auth.dump
# all read the exact same PostgreSQL snapshot.
mkfifo "$WORK/snap.in" "$WORK/snap.out"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q -At -F '|' <"$WORK/snap.in" >"$WORK/snap.out" 2>"$WORK/snap.err" &
SNAP_PID=$!
exec 3>"$WORK/snap.in"
exec 4<"$WORK/snap.out"
SNAP_OPEN=1

cat >&3 <<'SQL'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot();
SQL

if ! IFS= read -r SNAPSHOT_ID <&4 || [ -z "$SNAPSHOT_ID" ]; then
  fail "could not export database snapshot"
fi

cat >&3 <<'SQL'
SELECT 'auth.users', count(*) FROM auth.users
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
ORDER BY 1;
SELECT '__MANIFEST_END__';
SQL

: >"$WORK/counts.tsv"
while IFS= read -r line <&4; do
  [ "$line" = "__MANIFEST_END__" ] && break
  printf '%s\n' "$line" >>"$WORK/counts.tsv"
done
[ -s "$WORK/counts.tsv" ] || fail "failed to read snapshot row counts"

jq -Rn \
  --arg stamp "$STAMP" \
  --arg createdAt "$CREATED_AT" \
  '[inputs | split("|") | {key: .[0], value: (.[1] | tonumber)}] | from_entries | {version: 1, stamp: $stamp, createdAt: $createdAt, counts: .}' \
  <"$WORK/counts.tsv" >"$WORK/manifest.json" || fail "failed to build manifest.json"

pg_dump "$SUPABASE_DB_URL" --snapshot="$SNAPSHOT_ID" --format=custom --no-owner --no-privileges --schema=public \
  --file="$WORK/public.dump" || fail "pg_dump public failed"
pg_dump "$SUPABASE_DB_URL" --snapshot="$SNAPSHOT_ID" --format=custom --data-only --table=auth.users --table=auth.identities \
  --file="$WORK/auth.dump" || fail "pg_dump auth failed"

close_snapshot

# A dump that pg_restore cannot list or an invalid manifest is not a backup.
for f in public auth; do
  pg_restore --list "$WORK/$f.dump" >/dev/null || fail "$f.dump is unreadable"
done
jq -e '.version == 1 and (.counts | type == "object") and (.counts | length >= 12)' "$WORK/manifest.json" >/dev/null ||
  fail "manifest.json is invalid"

if [ -n "${BACKUP_OUT_DIR:-}" ]; then
  mkdir -p "$BACKUP_OUT_DIR"
  cp "$WORK/public.dump" "$WORK/auth.dump" "$WORK/manifest.json" "$BACKUP_OUT_DIR/" || fail "local copy failed"
else
  TOKEN_JSON=$(curl -sf -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token") ||
    fail "could not get an access token"
  TOKEN=$(printf '%s' "$TOKEN_JSON" | jq -r '.access_token // empty')
  [ -n "$TOKEN" ] || fail "access token missing in metadata response"

  for f in public.dump auth.dump manifest.json; do
    CONTENT_TYPE="application/octet-stream"
    [ "$f" = "manifest.json" ] && CONTENT_TYPE="application/json"
    # ifGenerationMatch=0: never replace an existing object.
    curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: $CONTENT_TYPE" \
      --data-binary "@$WORK/$f" \
      "https://storage.googleapis.com/upload/storage/v1/b/$BACKUP_BUCKET/o?uploadType=media&ifGenerationMatch=0&name=$STAMP/$f" \
      >/dev/null || fail "upload of $f failed"
  done
fi

SIZE=$(du -ck "$WORK/public.dump" "$WORK/auth.dump" "$WORK/manifest.json" | tail -1 | cut -f1)
log INFO success "$STAMP ${SIZE}KB"
