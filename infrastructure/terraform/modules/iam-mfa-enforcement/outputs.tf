output "policy_arn" {
  description = "ARN of the require-mfa managed policy. Useful if other states want to attach the same policy without re-defining it."
  value       = aws_iam_policy.mfa.arn
}

output "enforced_user_names" {
  description = "IAM user names the require-mfa policy is attached to."
  value       = [for a in aws_iam_user_policy_attachment.mfa : a.user]
}
