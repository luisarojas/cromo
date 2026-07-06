output "role_arn" {
  description = "Paste into the GitHub repo secret AWS_OPS_<ENV>_ROLE_ARN (e.g. AWS_OPS_DEV_ROLE_ARN)."
  value       = aws_iam_role.this.arn
}

output "role_name" {
  value = aws_iam_role.this.name
}
