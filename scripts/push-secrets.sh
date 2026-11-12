#!/usr/bin/env bash
# Copies the collector's secrets from .env.local into Secret Manager (one new version each).
# Values are piped through stdin and never printed. Run it yourself after `terraform apply` creates the secrets.
# Usage: scripts/push-secrets.sh [project-id] [secret-id]   (secret-id: push only that one)
set -euo pipefail

PROJECT="${1:-hy-easy}"
ONLY="${2:-}"
ENV_FILE=".env.local"

declare -a PAIRS=(
  "hy-easy-supabase-service-role:SUPABASE_SERVICE_ROLE_KEY"
  "hy-easy-hywep-id:HYWEP_ID"
  "hy-easy-hywep-pw:HYWEP_PW"
  "hy-easy-anthropic-api-key:ANTHROPIC_API_KEY"
  "hy-easy-db-url:SUPABASE_DB_URL"
)

[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found" >&2; exit 1; }

for pair in "${PAIRS[@]}"; do
  secret="${pair%%:*}"
  name="${pair##*:}"
  [ -z "$ONLY" ] || [ "$secret" = "$ONLY" ] || continue
  # Print the value to stdout only for the pipe; Node reads .env.local with the same parser the app uses.
  if ! node -e 'process.loadEnvFile(process.argv[1]); const v = process.env[process.argv[2]]; if (!v) process.exit(3); process.stdout.write(v);' "$ENV_FILE" "$name" \
    | gcloud secrets versions add "$secret" --project "$PROJECT" --data-file=- >/dev/null; then
    echo "✗ $secret ($name missing in $ENV_FILE or upload failed)" >&2
    exit 1
  fi
  echo "✓ $secret"
done
