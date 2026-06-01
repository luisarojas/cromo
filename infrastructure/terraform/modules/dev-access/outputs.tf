output "user_arns" {
  description = "ARNs of the dev IAM users created by this module."
  value       = [for u in aws_iam_user.dev : u.arn]
}

output "user_names" {
  description = "Names of the dev IAM users created by this module."
  value       = [for u in aws_iam_user.dev : u.name]
}
