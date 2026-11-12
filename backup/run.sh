#!/bin/sh
# Dumps the database and uploads it to the private backup bucket. See docs/BACKUP.md for what is kept and how to restore.
#   public.dump  schema + data of the public schema (postings, classifications, favorites, applications, admins, ...)
#   auth.dump    data of auth.users and auth.identities (accounts: ids that every student row points to, email, major)
# Env: SUPABASE_DB_URL (Secret Manager, session pooler on port 5432), BACKUP_BUCKET.
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
[ -n "${BACKUP_BUCKET:-}" ] || fail "BACKUP_BUCKET is not set"

STAMP=$(TZ=Asia/Seoul date +%Y-%m-%d_%H%M)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --schema=public \
  --file="$WORK/public.dump" || fail "pg_dump public failed"
pg_dump "$SUPABASE_DB_URL" --format=custom --data-only --table=auth.users --table=auth.identities \
  --file="$WORK/auth.dump" || fail "pg_dump auth failed"

# A dump that pg_restore cannot list is not a backup.
for f in public auth; do
  pg_restore --list "$WORK/$f.dump" >/dev/null || fail "$f.dump is unreadable"
done

TOKEN_JSON=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token") ||
  fail "could not get an access token"
TOKEN=$(printf '%s' "$TOKEN_JSON" | jq -r '.access_token // empty')
[ -n "$TOKEN" ] || fail "access token missing in metadata response"

for f in public auth; do
  # ifGenerationMatch=0: never replace an existing object.
  curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/octet-stream" \
    --data-binary "@$WORK/$f.dump" \
    "https://storage.googleapis.com/upload/storage/v1/b/$BACKUP_BUCKET/o?uploadType=media&ifGenerationMatch=0&name=$STAMP/$f.dump" \
    >/dev/null || fail "upload of $f.dump failed"
done

SIZE=$(du -ck "$WORK"/*.dump | tail -1 | cut -f1)
log INFO success "$STAMP ${SIZE}KB"
