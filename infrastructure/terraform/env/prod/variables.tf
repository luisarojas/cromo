variable "region" {
  type    = string
  default = "ca-central-1"
}

variable "account_id" {
  description = "AWS account ID — used to disambiguate S3 bucket names and reference the shared SES identity ARN."
  type        = string
}

variable "apex_domain" {
  description = "Apex domain registered at Namecheap (cromotrade.ca)."
  type        = string
  default     = "cromotrade.ca"
}

variable "ecr_registry" {
  description = "Account ECR registry URL — e.g. 123456789.dkr.ecr.ca-central-1.amazonaws.com"
  type        = string
}

variable "alert_email" {
  description = "Email subscribed to CloudWatch alarms. Use a real on-call distribution in prod."
  type        = string
}

variable "jwt_secret" {
  description = "Backend JWT signing secret. Generate with `openssl rand -base64 32`. Rotate via Secrets Manager + rolling redeploy, not by changing this var."
  type        = string
  sensitive   = true
}

variable "groq_api_key" {
  description = "Groq Llama-4 Scout vision API key. Must be a real key in prod — 'mock' will brick AI scanning."
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repo slug (`owner/name`) that's allowed to assume the deploy role via OIDC."
  type        = string
}
