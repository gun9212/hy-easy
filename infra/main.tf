terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "asia-northeast1" # Tokyo: Tier 1 pricing, close to Seoul (Supabase, HY-WEP).
}

variable "collector_image" {
  type        = string
  description = "Full image reference, e.g. asia-northeast1-docker.pkg.dev/<project>/hy-easy/collector:<tag>"
}

variable "supabase_url" {
  type = string
}

variable "hywep_list_url" {
  type    = string
  default = "https://hywep.hanyang.ac.kr/compjoinsearch/list.do"
}

variable "model_provider" {
  type    = string
  default = "anthropic"
}

variable "ai_enabled" {
  type    = bool
  default = true
}

variable "schedules_paused" {
  type        = bool
  default     = true
  description = "Keep the 5-minute schedule paused until one manual run of the job succeeds."
}

locals {
  services = toset([
    "run.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "storage.googleapis.com",
  ])

  # Secret Manager secret id => container environment variable. Values are added outside Terraform
  # (scripts/push-secrets.sh) so they never enter Terraform state.
  secrets = {
    "hy-easy-supabase-service-role" = "SUPABASE_SERVICE_ROLE_KEY"
    "hy-easy-hywep-id"              = "HYWEP_ID"
    "hy-easy-hywep-pw"              = "HYWEP_PW"
    "hy-easy-anthropic-api-key"     = "ANTHROPIC_API_KEY"
  }

  plain_env = {
    NEXT_PUBLIC_SUPABASE_URL  = var.supabase_url
    HYWEP_LIST_URL            = var.hywep_list_url
    HYWEP_SELECTORS_FILE      = "worker/selectors.verified.json"
    HYWEP_SESSION_BUCKET      = google_storage_bucket.session.name
    HYWEP_SESSION_OBJECT      = "hywep-state.json"
    MODEL_PROVIDER            = var.model_provider
    AI_CLASSIFICATION_ENABLED = tostring(var.ai_enabled)
  }

  schedules = {
    daytime = "*/5 9-17 * * 1-5"
    final   = "0 18 * * 1-5"
  }
}

resource "google_project_service" "api" {
  for_each           = local.services
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "collector" {
  account_id   = "hy-easy-collector"
  display_name = "HY-Easy private collector"
}

resource "google_service_account" "scheduler" {
  account_id   = "hy-easy-scheduler"
  display_name = "HY-Easy scheduler"
}

resource "google_artifact_registry_repository" "images" {
  repository_id = "hy-easy"
  location      = var.region
  format        = "DOCKER"
  depends_on    = [google_project_service.api]
}

# Operator session cookies (reused between runs to avoid a portal login every 5 minutes).
resource "google_storage_bucket" "session" {
  name                        = "${var.project_id}-hy-easy-session"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
}

resource "google_storage_bucket_iam_member" "session_rw" {
  bucket = google_storage_bucket.session.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.collector.email}"
}

resource "google_secret_manager_secret" "collector" {
  for_each  = local.secrets
  secret_id = each.key
  replication {
    auto {}
  }
  depends_on = [google_project_service.api]
}

resource "google_secret_manager_secret_iam_member" "collector_reader" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.collector[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.collector.email}"
}

resource "google_cloud_run_v2_job" "collector" {
  name                = "hy-easy-collector"
  location            = var.region
  deletion_protection = true

  template {
    task_count  = 1
    parallelism = 1
    template {
      timeout         = "240s"
      max_retries     = 0
      service_account = google_service_account.collector.email
      containers {
        image = var.collector_image
        resources {
          limits = { cpu = "1", memory = "2Gi" }
        }
        dynamic "env" {
          for_each = local.plain_env
          content {
            name  = env.key
            value = env.value
          }
        }
        dynamic "env" {
          for_each = local.secrets
          content {
            name = env.value
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.collector[env.key].secret_id
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [google_project_service.api, google_secret_manager_secret_iam_member.collector_reader]
}

resource "google_cloud_run_v2_job_iam_member" "invoke" {
  name     = google_cloud_run_v2_job.collector.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_scheduler_job" "poll" {
  for_each  = local.schedules
  name      = "hy-easy-${each.key}"
  region    = var.region
  schedule  = each.value
  time_zone = "Asia/Seoul"
  paused    = var.schedules_paused
  retry_config {
    retry_count = 0
  }
  http_target {
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.collector.name}:run"
    http_method = "POST"
    body        = base64encode("{}")
    headers     = { "Content-Type" = "application/json" }
    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
  depends_on = [google_project_service.api, google_cloud_run_v2_job_iam_member.invoke]
}

output "session_bucket" {
  value = google_storage_bucket.session.name
}

output "collector_service_account" {
  value = google_service_account.collector.email
}

output "image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}
