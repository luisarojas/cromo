variable "region" {
  description = "AWS region for the state bucket and ECR repos. Stay in ca-central-1 for PIPEDA."
  type        = string
  default     = "ca-central-1"
}

variable "account_id" {
  description = "AWS account ID — only used to disambiguate the state bucket name."
  type        = string
}
