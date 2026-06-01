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

variable "scan_provider" {
  description = "Which AI vision backend identifySticker dispatches to: 'gemini' or 'groq'. See the 'AI Scan Provider' section in CLAUDE.md for the trade-offs."
  type        = string
  default     = "gemini"
  validation {
    condition     = contains(["gemini", "groq"], var.scan_provider)
    error_message = "scan_provider must be either 'gemini' or 'groq'."
  }
}

variable "scan_model" {
  description = "Optional model id override for the active provider. Empty string falls back to the code-side default (gemini-2.5-flash for gemini, meta-llama/llama-4-maverick-17b-128e-instruct for groq). Set to e.g. 'gemini-2.5-pro' or 'meta-llama/llama-4-scout-17b-16e-instruct' to override without a redeploy."
  type        = string
  default     = ""
}

variable "gemini_api_key" {
  description = "Google Gemini API key (https://aistudio.google.com/apikey). Consulted only when scan_provider='gemini'. 'mock' keeps AI scanning mocked."
  type        = string
  default     = "mock"
}

variable "groq_api_key" {
  description = "Groq Cloud API key (https://console.groq.com/keys). Consulted only when scan_provider='groq'. 'mock' keeps AI scanning mocked."
  type        = string
  default     = "mock"
  sensitive   = true
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

variable "admin_emails" {
  description = "Email addresses to provision as admin users in Cognito."
  type        = list(string)
  default     = []
}

variable "admin_temp_password" {
  description = "Temporary password for bootstrapped admin users (must be changed on first login)."
  type        = string
  sensitive   = true
  default     = ""
}
