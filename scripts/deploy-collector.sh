#!/usr/bin/env bash
# Deploys the HY-WEP collector to Cloud Run Jobs in stages. Run each stage yourself and read its output.
#   scripts/deploy-collector.sh base      # APIs, image registry, service accounts, secret containers, session bucket
#   scripts/deploy-collector.sh secrets   # copy secrets from .env.local into Secret Manager (values never printed)
#   scripts/deploy-collector.sh image     # build and push the collector image with Cloud Build
#   scripts/deploy-collector.sh job       # create or update the Cloud Run Job (TAG=v2 for a new image); schedules stay on
#   scripts/deploy-collector.sh run       # run the job once and show the result
#   scripts/deploy-collector.sh schedule  # turn the weekday 5-minute schedule on (pause: schedule-off)
set -euo pipefail

PROJECT="hy-easy"
REGION="asia-northeast1"
# Without TAG, keep the image the job runs now, so a schedule change never rolls the collector back.
CURRENT_TAG="$(gcloud run jobs describe hy-easy-collector --project "$PROJECT" --region "$REGION" \
  --format='value(spec.template.spec.template.spec.containers[0].image)' 2>/dev/null | sed -n 's/.*://p')"
TAG="${TAG:-${CURRENT_TAG:-v1}}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/hy-easy/collector:${TAG}"
TFVARS="hy-easy.tfvars"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

tf() { (cd "$ROOT/infra" && terraform "$@" -var-file="$TFVARS" -var "collector_image=$IMAGE"); }

case "${1:-}" in
  base)
    (cd "$ROOT/infra" && terraform init -input=false >/dev/null)
    tf apply \
      -target=google_project_service.api \
      -target=google_artifact_registry_repository.images \
      -target=google_service_account.scheduler \
      -target=google_secret_manager_secret_iam_member.collector_reader \
      -target=google_storage_bucket_iam_member.session_rw
    ;;
  secrets)
    (cd "$ROOT" && scripts/push-secrets.sh "$PROJECT")
    ;;
  image)
    (cd "$ROOT" && gcloud builds submit --project "$PROJECT" --region "$REGION" \
      --config infra/cloudbuild.yaml --substitutions=_IMAGE="$IMAGE" .)
    ;;
  job)
    tf apply
    ;;
  run)
    gcloud run jobs execute hy-easy-collector --project "$PROJECT" --region "$REGION" --wait
    gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=hy-easy-collector" \
      --project "$PROJECT" --limit 5 --freshness 15m --format "value(textPayload)" | grep -E '"status"' | head -1
    ;;
  schedule)
    tf apply -var schedules_paused=false
    ;;
  schedule-off)
    tf apply -var schedules_paused=true
    ;;
  *)
    sed -n '2,9p' "$0"
    exit 1
    ;;
esac
