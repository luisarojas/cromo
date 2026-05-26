output "enabled" { value = var.enable }

output "scheduler_role_arn" {
  value       = try(aws_iam_role.scheduler[0].arn, null)
  description = "IAM role EventBridge Scheduler assumes to call rds:Start/StopDBInstance. null when disabled."
}
