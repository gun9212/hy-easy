# Database backup: twice a day (03:00 and 15:00 KST) a Cloud Run job dumps the database into a private bucket in
# Seoul, kept 23 days live + 7 days Cloud Storage soft delete (30 days total until permanent purge).
# Everything runs in Seoul, next to Supabase, so student data does not leave Korea.
# The job's account can only create objects: it cannot read, overwrite or delete existing backups.
# Restore steps: docs/BACKUP.md.

variable "backup_region" {
  type    = string
  default = "asia-northeast3" # Seoul
}

variable "backup_retention_days" {
  type        = number
  default     = 23
  description = "Days a backup stays live before lifecycle Delete runs (23 + 7-day soft delete = 30 days total)."
}

variable "backup_soft_delete_days" {
  type        = number
  default     = 7
  description = "Cloud Storage soft-delete recovery window after deletion (minimum 7 days when enabled)."
}

variable "backup_image" {
  type        = string
  default     = "asia-northeast1-docker.pkg.dev/hy-easy/hy-easy/backup:latest"
  description = "Initial image; GitHub Actions moves the job to each new backup/ commit afterwards."
}

locals {
  backup_schedules = {
    night = "0 3 * * *"
    day   = "0 15 * * *"
  }
}

resource "google_service_account" "backup" {
  account_id   = "hy-easy-backup"
  display_name = "HY-Easy database backup"
}

resource "google_storage_bucket" "backup" {
  name                        = "${var.project_id}-hy-easy-db-backup"
  location                    = var.backup_region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  soft_delete_policy {
    retention_duration_seconds = var.backup_soft_delete_days * 86400
  }
  lifecycle_rule {
    condition {
      age = var.backup_retention_days
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "backup_writer" {
  bucket = google_storage_bucket.backup.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.backup.email}"
}

# The value (the session-pooler connection string) is added outside Terraform, like the collector secrets.
resource "google_secret_manager_secret" "db_url" {
  secret_id = "hy-easy-db-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.api]
}

resource "google_secret_manager_secret_iam_member" "backup_db_url" {
  secret_id = google_secret_manager_secret.db_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backup.email}"
}

resource "google_artifact_registry_repository_iam_member" "backup_pull" {
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.backup.email}"
}

resource "google_cloud_run_v2_job" "backup" {
  name                = "hy-easy-backup"
  location            = var.backup_region
  deletion_protection = false
  template {
    task_count = 1
    template {
      service_account = google_service_account.backup.email
      timeout         = "600s"
      max_retries     = 1
      containers {
        image = var.backup_image
        resources {
          limits = { cpu = "1", memory = "512Mi" }
        }
        env {
          name  = "BACKUP_BUCKET"
          value = google_storage_bucket.backup.name
        }
        env {
          name = "SUPABASE_DB_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.db_url.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [
    google_project_service.api,
    google_secret_manager_secret_iam_member.backup_db_url,
    google_artifact_registry_repository_iam_member.backup_pull,
  ]
}

resource "google_cloud_run_v2_job_iam_member" "backup_invoke" {
  name     = google_cloud_run_v2_job.backup.name
  location = var.backup_region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_scheduler_job" "backup" {
  for_each  = local.backup_schedules
  name      = "hy-easy-backup-${each.key}"
  region    = var.region
  schedule  = each.value
  time_zone = "Asia/Seoul"
  retry_config {
    retry_count = 1
  }
  http_target {
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.backup_region}/jobs/${google_cloud_run_v2_job.backup.name}:run"
    http_method = "POST"
    body        = base64encode("{}")
    headers     = { "Content-Type" = "application/json" }
    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
  depends_on = [google_project_service.api, google_cloud_run_v2_job_iam_member.backup_invoke]
}

# GitHub Actions moves the backup job to each new image, like the collector.
resource "google_cloud_run_v2_job_iam_member" "deployer_backup_job" {
  name     = google_cloud_run_v2_job.backup.name
  location = var.backup_region
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_backup" {
  service_account_id = google_service_account.backup.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_logging_metric" "backup_runs" {
  name   = "hy_easy_backup_runs"
  filter = "resource.type = \"cloud_run_job\" AND resource.labels.job_name = \"${google_cloud_run_v2_job.backup.name}\" AND jsonPayload.event = \"backup\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    labels {
      key        = "status"
      value_type = "STRING"
    }
  }
  label_extractors = { status = "EXTRACT(jsonPayload.status)" }
  depends_on       = [google_project_service.api]
}

resource "google_monitoring_alert_policy" "backup_failing" {
  display_name          = "HY-Easy DB 백업 실패"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.operator.id]
  conditions {
    display_name = "백업 실패 기록"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_job\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.backup_runs.name}\" AND metric.labels.status = \"failed\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
  # Backups run every 12 hours; 14 hours without a success means at least one run is missing or failed silently.
  conditions {
    display_name = "14시간 넘게 성공한 백업 없음"
    condition_absent {
      filter   = "resource.type = \"cloud_run_job\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.backup_runs.name}\" AND metric.labels.status = \"success\""
      duration = "50400s"
      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
  alert_strategy {
    auto_close           = "86400s"
    notification_prompts = ["OPENED", "CLOSED"]
  }
  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      HY-Easy DB 백업이 실패했거나 14시간 넘게 성공하지 못했습니다. 학생 데이터를 잃지 않도록 확인해 주세요.
      - Cloud Run 작업 hy-easy-backup(서울)의 최근 실행 로그에서 "event":"backup" 줄의 message를 확인합니다.
      - "pg_dump ... failed": Supabase 비밀번호가 바뀌었다면 Secret Manager의 hy-easy-db-url 값을 갱신합니다.
      - 복구 방법은 저장소의 docs/BACKUP.md에 있습니다.
    EOT
  }
  depends_on = [google_project_service.api]
}

output "backup_bucket" {
  value = google_storage_bucket.backup.name
}
