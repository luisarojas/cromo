terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# Docker container logs flow here via the awslogs driver in docker-compose.prod.yml.

resource "aws_cloudwatch_log_group" "api" {
  name              = "/cromo/${var.env}/api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/cromo/${var.env}/frontend"
  retention_in_days = var.log_retention_days
}

# ─── Minimal alarms ───────────────────────────────────────────────────────────
# Just enough to fire on the things that will actually wake someone up.
# Per-target-group 5xx (means the app is returning errors), ALB unhealthy
# hosts (means the app is dead), RDS CPU > 80% (means we need to scale).

resource "aws_sns_topic" "alerts" {
  name = "cromo-${var.env}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "cromo-${var.env}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU > 80% for 15 min"
  dimensions          = { DBInstanceIdentifier = var.db_identifier }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "cromo-${var.env}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "ALB sees an unhealthy host — app may be down"
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
