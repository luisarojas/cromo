output "deploy_role_arn" {
  description = "Paste into the GitHub repo secret AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}

output "deploy_role_name" {
  value = aws_iam_role.deploy.name
}
