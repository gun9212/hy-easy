# Operator alerts by email. Three situations, each with its own response written into the alert email:
#   1. collector runs fail (portal error, session expired, login failed)
#   2. the collector does not run at all on a weekday daytime (schedule paused, invocation broken)
#   3. AI classification keeps failing (API key, credit) while collection itself still succeeds

variable "alert_email" {
  type        = string
  description = "Operator address that receives collector and classification alerts."
}

locals {
  job_filter = "resource.type = \"cloud_run_job\" AND resource.labels.job_name = \"${google_cloud_run_v2_job.collector.name}\""
}

# Counted from the collector's own result line (one JSON line per run with status and elapsedSec). Cloud Run's
# job/completed_execution_count was tried first: it reported 0 for 99 of 102 successful executions on 2026-11-12,
# so it cannot count runs.
resource "google_logging_metric" "collector_runs" {
  name   = "hy_easy_collector_runs"
  filter = "${local.job_filter} AND jsonPayload.status:* AND jsonPayload.elapsedSec:*"
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

resource "google_monitoring_notification_channel" "operator" {
  display_name = "HY-Easy operator"
  type         = "email"
  labels       = { email_address = var.alert_email }
  depends_on   = [google_project_service.api]
}

resource "google_monitoring_alert_policy" "collector_failing" {
  display_name          = "HY-Easy 수집 실패"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.operator.id]
  conditions {
    display_name = "수집 실행이 30분 안에 3회 이상 실패"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_job\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.collector_runs.name}\" AND metric.labels.status = one_of(\"failed\", \"session_expired\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      duration        = "0s"
      aggregations {
        alignment_period     = "1800s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
  alert_strategy {
    auto_close           = "3600s"
    notification_prompts = ["OPENED", "CLOSED"]
  }
  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      HY-Easy 수집기가 연속으로 실패하고 있습니다. https://hy-easy.vercel.app/admin 의 "최근 수집 실행"에서 오류 코드를 확인하세요.
      - LOGIN_FAILED / LOGIN_BLOCKED / SESSION_EXPIRED: 포털 비밀번호가 바뀌었는지 확인하고 Secret Manager 값을 갱신합니다(scripts/push-secrets.sh).
      - COLLECTION_FAILED: HY-WEP 화면 구조가 바뀌었을 수 있습니다. Cloud Run 작업 로그의 collection_failed 메시지를 개발자에게 전달하세요.
    EOT
  }
  depends_on = [google_project_service.api]
}

# Weekdays, 10:00-18:00 KST (01:00-09:00 UTC): at least one successful run in the last 35 minutes.
# Nights and weekends are excluded because the schedule does not run then.
resource "google_monitoring_alert_policy" "collector_silent" {
  display_name          = "HY-Easy 수집 멈춤"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.operator.id]
  conditions {
    display_name = "평일 낮에 35분 넘게 성공한 수집 없음"
    condition_prometheus_query_language {
      query               = <<-EOT
        (
          sum(increase(logging_googleapis_com:user_${google_logging_metric.collector_runs.name}{monitored_resource="cloud_run_job",status=~"success|partial"}[35m]))
          or vector(0)
        ) == 0
        and on() (hour() >= 1 and hour() < 9)
        and on() (day_of_week() >= 1 and day_of_week() <= 5)
      EOT
      duration            = "300s"
      evaluation_interval = "60s"
    }
  }
  alert_strategy {
    auto_close           = "3600s"
    notification_prompts = ["OPENED", "CLOSED"]
  }
  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      평일 낮인데 HY-Easy 수집기가 35분 넘게 성공하지 못했습니다. 실패가 아니라 실행 자체가 없을 수 있습니다.
      - Cloud Scheduler의 hy-easy-daytime 작업이 일시중지(PAUSED)되지 않았는지 확인합니다.
      - Cloud Run 작업 hy-easy-collector의 최근 실행 기록과 이미지 배포 상태(GitHub Actions)를 확인합니다.
    EOT
  }
  depends_on = [google_project_service.api]
}

resource "google_logging_metric" "classification_failed" {
  name   = "hy-easy-classification-failed"
  filter = "${local.job_filter} AND jsonPayload.event = \"classification_failed\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
  depends_on = [google_project_service.api]
}

# One unclassifiable posting fails at most three times, so more than five failures an hour means a systemic cause.
resource "google_monitoring_alert_policy" "classification_failing" {
  display_name          = "HY-Easy AI 분류 실패"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.operator.id]
  conditions {
    display_name = "1시간 안에 AI 분류 실패 6건 이상"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_job\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.classification_failed.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"
      aggregations {
        alignment_period     = "3600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
  alert_strategy {
    auto_close           = "3600s"
    notification_prompts = ["OPENED", "CLOSED"]
  }
  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      HY-Easy의 AI 분류가 계속 실패하고 있습니다. 수집은 되지만 새 공고가 "분류 없음"으로 쌓입니다.
      - Anthropic 콘솔에서 크레딧 잔액과 API 키 상태를 확인합니다. 키를 바꿨다면 Secret Manager 값을 갱신합니다.
      - Cloud Run 작업 로그의 classification_failed 메시지에 원인이 있습니다.
    EOT
  }
  depends_on = [google_project_service.api]
}
