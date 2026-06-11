output "role_arn" {
  description = "Paste into the GitHub repo secret AWS_TF_RUNNER_ROLE_ARN."
  value       = aws_iam_role.this.arn
}

output "role_name" {
  value = aws_iam_role.this.name
}
