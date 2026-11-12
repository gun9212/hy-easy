# GitHub Actions deploys the collector without a stored key: GitHub's OIDC token is exchanged for a short-lived
# token of the deployer service account (Workload Identity Federation). Only pushes to main of this repository qualify.

variable "github_repository" {
  type    = string
  default = "gun9212/hy-easy"
}

resource "google_project_service" "deploy_api" {
  for_each           = toset(["sts.googleapis.com", "iamcredentials.googleapis.com", "iam.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.deploy_api]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "hy-easy"
  display_name                       = "hy-easy main branch"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "hy-easy-deployer"
  display_name = "HY-Easy collector deployer (GitHub Actions)"
}

resource "google_service_account_iam_member" "deployer_from_github" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Submit Cloud Build builds and read their logs.
resource "google_project_iam_member" "deployer_project" {
  for_each = toset(["roles/cloudbuild.builds.editor", "roles/serviceusage.serviceUsageConsumer", "roles/logging.viewer"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

# Upload the build source to the bucket gcloud builds submit uses (created by Cloud Build on the first build).
resource "google_storage_bucket_iam_member" "deployer_build_source" {
  bucket = "${var.project_id}_cloudbuild"
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

# Point the collector job at the new image; the job runs as the collector account, so the deployer may act as it.
resource "google_cloud_run_v2_job_iam_member" "deployer_job" {
  name     = google_cloud_run_v2_job.collector.name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_collector" {
  service_account_id = google_service_account.collector.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

output "github_wif_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "github_deployer_service_account" {
  value = google_service_account.deployer.email
}

# Builds run as their own account that can only read the uploaded source, push images and write build logs,
# instead of the project's default compute account (Editor).
resource "google_service_account" "builder" {
  account_id   = "hy-easy-builder"
  display_name = "HY-Easy collector image builder (Cloud Build)"
}

resource "google_artifact_registry_repository_iam_member" "builder_push" {
  repository = google_artifact_registry_repository.images.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_project_iam_member" "builder_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_storage_bucket_iam_member" "builder_source" {
  bucket = "${var.project_id}_cloudbuild"
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_builder" {
  service_account_id = google_service_account.builder.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
