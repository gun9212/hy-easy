#!/usr/bin/env bash
# Verifies that Cloud Build's upload list (evaluated against .gcloudignore) never includes
# private evaluation snapshots, local database restore dumps, credentials, or internal notes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

UPLOAD_LIST="$(gcloud meta list-files-for-upload .)"

FORBIDDEN_REGEX='(^|/)(gha-creds-|restore(/|$)|\.secrets(/|$)|\.claude(/|$)|\.hallmark(/|$)|evals(/|$)|\.env(\.|$))|\.dump$|\.tfstate|\.tfvars$|(^|/)docs/(PLAN|TODO|classification-check)\.md$|(^|/)docs/프로젝트-검토-'

# Filter out explicitly allowed templates (.env.example, infra/example.tfvars).
MATCHES="$(printf '%s\n' "$UPLOAD_LIST" \
  | grep -Ev '(^|/)\.env\.example$|(^|/)example\.tfvars$' \
  | grep -E "$FORBIDDEN_REGEX" || true)"

if [ -n "$MATCHES" ]; then
  echo "ERROR: Cloud Build upload list contains forbidden private files:" >&2
  printf '%s\n' "$MATCHES" >&2
  echo "Update .gcloudignore before running gcloud builds submit." >&2
  exit 1
fi

COUNT="$(printf '%s\n' "$UPLOAD_LIST" | sed '/^$/d' | wc -l | tr -d ' ')"
echo "Cloud Build upload check passed ($COUNT files)."
