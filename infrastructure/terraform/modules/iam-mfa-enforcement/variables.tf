variable "user_names" {
  type        = list(string)
  description = "IAM user names to attach the require-mfa managed policy to. Users do not need to be Terraform-managed — only the attachment is."
}

variable "policy_name" {
  type        = string
  description = "Name of the customer-managed policy. Must be unique within the AWS account, so callers in different Terraform states (e.g. env/shared vs env/dev) must pass distinct values."
}
