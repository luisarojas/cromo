output "uploads_bucket" { value = aws_s3_bucket.uploads.id }
output "uploads_bucket_arn" { value = aws_s3_bucket.uploads.arn }
output "uploads_bucket_regional_domain" { value = aws_s3_bucket.uploads.bucket_regional_domain_name }
