output "tfstate_bucket" {
  value = aws_s3_bucket.tfstate.id
}

output "tfstate_lock_table" {
  value = aws_dynamodb_table.tfstate_lock.id
}

output "ecr_backend_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider. Per-env CI/CD roles reference this in their trust policy (or look it up by URL via data source)."
  value       = aws_iam_openid_connect_provider.github.arn
}
