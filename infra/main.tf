terraform {

  required_version = ">= 1.6"
  required_providers {

    google = {
      source = "hashicorp/google", version = "~> 6.0"
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
  default = "asia-northeast1"
}

variable "collector_image" {
  type = string
}

variable "supabase_url" {
  type = string
}

variable "hywep_list_url" {
  type = string
}

variable "model_provider" {
  type    = string
  default = "claude"
}

variable "ai_enabled" {
  type    = bool
  default = false
}

locals {

  services = toset(["run.googleapis.com", "cloudscheduler.googleapis.com", "secretmanager.googleapis.com", "aiplatform.googleapis.com", "artifactregistry.googleapis.com", "storage.googleapis.com"])

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

resource "google_storage_bucket" "session" {

  name                        = "${var.project_id}-hy-easy-session"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

}

resource "google_storage_bucket_iam_member" "session_reader" {

  bucket = google_storage_bucket.session.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.collector.email}"

}

resource "google_secret_manager_secret" "supabase" {

  secret_id = "hy-easy-supabase-service-role"
  replication {
    auto {

    }

  }

  depends_on = [google_project_service.api]

}

resource "google_secret_manager_secret_iam_member" "key_reader" {

  secret_id = google_secret_manager_secret.supabase.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.collector.email}"

}

resource "google_project_iam_member" "model_caller" {

  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.collector.email}"

}

resource "google_artifact_registry_repository" "images" {

  repository_id = "hy-easy"
  location      = var.region
  format        = "DOCKER"
  depends_on    = [google_project_service.api]

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
          limits = {
            cpu = "1", memory = "2Gi"
          }

        }

        env {
          name  = "NEXT_PUBLIC_SUPABASE_URL"
          value = var.supabase_url
        }

        env {
          name = "SUPABASE_SERVICE_ROLE_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.supabase.secret_id
              version = "latest"
            }

          }

        }

        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.project_id
        }

        env {
          name  = "HYWEP_LIST_URL"
          value = var.hywep_list_url
        }

        env {
          name  = "HYWEP_SELECTORS_FILE"
          value = "worker/selectors.verified.json"
        }

        env {
          name  = "HYWEP_SESSION_BUCKET"
          value = google_storage_bucket.session.name
        }

        env {
          name  = "HYWEP_SESSION_OBJECT"
          value = "hywep-state.json"
        }

        env {
          name  = "MODEL_PROVIDER"
          value = var.model_provider
        }

        env {
          name  = "MODEL_LOCATION"
          value = "global"
        }

        env {
          name  = "AI_CLASSIFICATION_ENABLED"
          value = tostring(var.ai_enabled)
        }


      }


    }


  }

  depends_on = [google_project_service.api, google_secret_manager_secret_iam_member.key_reader]

}

resource "google_cloud_run_v2_job_iam_member" "invoke" {

  name     = google_cloud_run_v2_job.collector.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"

}

resource "google_cloud_scheduler_job" "poll" {

  for_each = {
    daytime = "*/5 9-17 * * 1-5", final = "0 18 * * 1-5"
  }

  name      = "hy-easy-${each.key}"
  region    = var.region
  schedule  = each.value
  time_zone = "Asia/Seoul"
  paused    = true # Enable only after one successful authenticated end-to-end collection.
  retry_config {
    retry_count = 0
  }

  http_target {

    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.collector.name}:run"
    http_method = "POST"
    body        = base64encode("{}")
    headers = {
      "Content-Type" = "application/json"
    }

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

