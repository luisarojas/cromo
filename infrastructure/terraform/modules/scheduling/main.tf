terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# Uptime schedule for non-prod environments. The ASG scales to 1 instance
# while the environment is "up" and to 0 outside of those hours; the RDS
# instance is stopped/started on the same cadence via EventBridge
# Scheduler's native RDS API targets (no Lambda required).
#
# The start time differs by day group (weekdays vs weekends) while the
# nightly stop is uniform across all seven days.
#
# Set enable = false on prod — the resources still render but use a
# never-fires expression and a 0-desired-capacity baseline.

locals {
  active    = var.enable
  time_zone = var.time_zone

  weekday_days = "MON-FRI"
  weekend_days = "SAT-SUN"
  all_days     = "MON-SUN"

  weekday_start_cron = "cron(${var.start_minute} ${var.weekday_start_hour} ? * ${local.weekday_days} *)"
  weekend_start_cron = "cron(${var.start_minute} ${var.weekend_start_hour} ? * ${local.weekend_days} *)"
  stop_cron          = "cron(${var.stop_minute} ${var.stop_hour} ? * ${local.all_days} *)"
}

# ─── ASG: scheduled scale up / scale down ─────────────────────────────────────
# aws_autoscaling_schedule recurrence is 5-field cron in the given time_zone.

resource "aws_autoscaling_schedule" "scale_up_weekday" {
  count                  = local.active ? 1 : 0
  scheduled_action_name  = "cromo-${var.env}-asg-up-weekday"
  autoscaling_group_name = var.asg_name
  min_size               = 1
  max_size               = 1
  desired_capacity       = 1
  recurrence             = "${var.start_minute} ${var.weekday_start_hour} * * ${local.weekday_days}"
  time_zone              = local.time_zone
}

resource "aws_autoscaling_schedule" "scale_up_weekend" {
  count                  = local.active ? 1 : 0
  scheduled_action_name  = "cromo-${var.env}-asg-up-weekend"
  autoscaling_group_name = var.asg_name
  min_size               = 1
  max_size               = 1
  desired_capacity       = 1
  recurrence             = "${var.start_minute} ${var.weekend_start_hour} * * ${local.weekend_days}"
  time_zone              = local.time_zone
}

resource "aws_autoscaling_schedule" "scale_down" {
  count                  = local.active ? 1 : 0
  scheduled_action_name  = "cromo-${var.env}-asg-down"
  autoscaling_group_name = var.asg_name
  min_size               = 0
  max_size               = 0
  desired_capacity       = 0
  recurrence             = "${var.stop_minute} ${var.stop_hour} * * ${local.all_days}"
  time_zone              = local.time_zone
}

# ─── RDS: scheduled stop / start via EventBridge Scheduler ────────────────────
# EventBridge Scheduler universal targets can call any AWS SDK action
# directly, so we don't need a Lambda just to flip the instance.

data "aws_iam_policy_document" "scheduler_assume" {
  count = local.active ? 1 : 0
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scheduler_inline" {
  count = local.active ? 1 : 0
  statement {
    sid       = "RDSStartStop"
    actions   = ["rds:StartDBInstance", "rds:StopDBInstance", "rds:DescribeDBInstances"]
    resources = [var.db_arn]
  }
}

resource "aws_iam_role" "scheduler" {
  count              = local.active ? 1 : 0
  name               = "cromo-${var.env}-rds-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume[0].json
}

resource "aws_iam_role_policy" "scheduler" {
  count  = local.active ? 1 : 0
  name   = "cromo-${var.env}-rds-scheduler-inline"
  role   = aws_iam_role.scheduler[0].id
  policy = data.aws_iam_policy_document.scheduler_inline[0].json
}

resource "aws_scheduler_schedule" "rds_start_weekday" {
  count       = local.active ? 1 : 0
  name        = "cromo-${var.env}-rds-start-weekday"
  group_name  = "default"
  description = "Start the dev RDS instance Mon-Fri ${var.weekday_start_hour}:${var.start_minute} ${local.time_zone}"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = local.weekday_start_cron
  schedule_expression_timezone = local.time_zone

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:startDBInstance"
    role_arn = aws_iam_role.scheduler[0].arn
    input = jsonencode({
      DbInstanceIdentifier = var.db_identifier
    })
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}

resource "aws_scheduler_schedule" "rds_start_weekend" {
  count       = local.active ? 1 : 0
  name        = "cromo-${var.env}-rds-start-weekend"
  group_name  = "default"
  description = "Start the dev RDS instance Sat-Sun ${var.weekend_start_hour}:${var.start_minute} ${local.time_zone}"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = local.weekend_start_cron
  schedule_expression_timezone = local.time_zone

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:startDBInstance"
    role_arn = aws_iam_role.scheduler[0].arn
    input = jsonencode({
      DbInstanceIdentifier = var.db_identifier
    })
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}

resource "aws_scheduler_schedule" "rds_stop" {
  count       = local.active ? 1 : 0
  name        = "cromo-${var.env}-rds-stop"
  group_name  = "default"
  description = "Stop the dev RDS instance daily ${var.stop_hour}:${var.stop_minute} ${local.time_zone}"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = local.stop_cron
  schedule_expression_timezone = local.time_zone

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance"
    role_arn = aws_iam_role.scheduler[0].arn
    input = jsonencode({
      DbInstanceIdentifier = var.db_identifier
    })
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}
