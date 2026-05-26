output "distribution_id" {
  value       = aws_cloudfront_distribution.main.id
  description = "CloudFront distribution ID (use with `aws cloudfront create-invalidation`)."
}

output "distribution_domain" {
  value       = aws_cloudfront_distribution.main.domain_name
  description = "*.cloudfront.net domain. Use this until a custom hostname is wired up."
}

output "uploads_url" {
  value       = var.cdn_hostname == "" ? "https://${aws_cloudfront_distribution.main.domain_name}" : "https://${var.cdn_hostname}"
  description = "Public base URL for uploads — feeds the app's UPLOADS_PUBLIC_URL env var."
}
