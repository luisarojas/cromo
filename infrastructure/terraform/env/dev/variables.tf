variable "region" {
  type    = string
  default = "ca-central-1"
}

variable "account_id" {
  description = "AWS account ID — used to disambiguate S3 bucket names."
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
  description = "Email subscribed to CloudWatch alarms and DMARC reports."
  type        = string
}

variable "jwt_secret" {
  description = "Backend JWT signing secret (used for internal short-lived tokens; Cognito tokens are RS256-verified via JWKS)."
  type        = string
  sensitive   = true
}

variable "groq_api_key" {
  description = "Groq Llama-4 Scout vision API key. Set to 'mock' to keep AI scanning mocked in dev."
  type        = string
  default     = "mock"
}

variable "github_repo" {
  description = "GitHub repo slug (`owner/name`) that's allowed to assume the deploy role via OIDC."
  type        = string
}

variable "alb_ingress_cidrs" {
  description = "CIDR allowlist for the ALB. Restrict in dev to keep the environment off the public internet."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
