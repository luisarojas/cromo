variable "env" { type = string }
variable "from_email" { type = string }
variable "ses_identity_arn" { type = string }
variable "deletion_protection" {
  type    = bool
  default = false
}

variable "admin_emails" {
  description = "Email addresses to create as admin users in Cognito. Each gets a temporary password and is added to the 'admin' group. They must complete a password-reset challenge on first login."
  type        = list(string)
  default     = []
}

variable "admin_temp_password" {
  description = "Temporary password assigned to every admin user on creation. Required when admin_emails is non-empty. Must satisfy the user pool password policy (12+ chars, upper, lower, number)."
  type        = string
  sensitive   = true
  default     = ""
}
