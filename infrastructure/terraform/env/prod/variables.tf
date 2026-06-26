variable "region" {
  type    = string
  default = "ca-central-1"
}

variable "account_id" {
  description = "AWS account ID — used to disambiguate S3 bucket names and reference the shared SES identity ARN. Empty string (default) triggers automatic lookup via aws_caller_identity."
  type        = string
  default     = ""
}

variable "apex_domain" {
  description = "Apex domain registered at Namecheap (cromotrade.ca)."
  type        = string
  default     = "cromotrade.ca"
}

variable "ecr_registry" {
  description = "Account ECR registry URL. Empty string (default) derives it from account_id + region at apply time."
  type        = string
  default     = ""
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
  description = "Optional model id override for the active provider. Empty string falls back to the code-side default (gemini-2.5-flash for gemini, meta-llama/llama-4-scout-17b-16e-instruct for groq). Set to e.g. 'gemini-2.5-pro' to override without a redeploy."
  type        = string
  default     = ""
}

variable "gemini_api_key" {
  description = "Google Gemini API key (https://aistudio.google.com/apikey). Consulted only when scan_provider='gemini'. Must be real (not 'mock') if scan_provider='gemini' in prod, otherwise AI scanning is bricked."
  type        = string
  default     = "mock"
  sensitive   = true
}

variable "groq_api_key" {
  description = "Groq Cloud API key (https://console.groq.com/keys). Consulted only when scan_provider='groq'. Must be real (not 'mock') if scan_provider='groq' in prod, otherwise AI scanning is bricked."
  type        = string
  default     = "mock"
  sensitive   = true
}

variable "wc_api_key" {
  description = "football-data.org API key (https://www.football-data.org/client/register) for the WC 2026 standings feature, matching WC_DATA_PROVIDER=football-data. 'mock' (default) keeps the standings page on deterministic sample data; set a real key for live fixtures/results."
  type        = string
  default     = "mock"
  sensitive   = true
}

variable "admin_emails" {
  description = "Email addresses to provision as admin users in Cognito (added to the 'admin' group)."
  type        = list(string)
  default     = []
}

variable "admin_temp_password" {
  description = "Temporary password for bootstrapped admin users. Required when admin_emails is non-empty; must satisfy the pool policy (12+ chars, upper, lower, number). Admins reset it via forgot-password on first login."
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_repo" {
  description = "GitHub repo slug (`owner/name`) that's allowed to assume the deploy role via OIDC."
  type        = string
  default     = "luisarojas/cromo"
}
