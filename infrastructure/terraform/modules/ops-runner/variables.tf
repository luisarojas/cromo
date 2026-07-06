variable "env" {
  description = "Environment this runner controls (dev|prod). Drives the role name so dev and prod get distinct roles."
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be 'dev' or 'prod'."
  }
}

variable "github_sub_patterns" {
  description = <<-EOT
    Allowed values for the GitHub OIDC token's `sub` claim. The ops
    workflow assumes this role under one of these patterns; anything else
    is rejected by STS. The workflow declares a GitHub Environment, so the
    subject is `repo:<owner>/<repo>:environment:<env-name>`, e.g.

      ["repo:luisarojas/cromo:environment:ops-dev"]
  EOT
  type        = list(string)
}

variable "db_instance_identifier" {
  description = "RDS instance the role may start/stop. Defaults to cromo-<env>-db (matches DB_ID in scripts/dev-env.sh); override only if the naming diverges."
  type        = string
  default     = null
}

variable "asg_name" {
  description = "Auto Scaling group the role may scale. Defaults to cromo-<env>-app (matches ASG_NAME in scripts/dev-env.sh); override only if the naming diverges."
  type        = string
  default     = null
}

variable "max_session_duration_seconds" {
  description = "Max session length when assumed. 1h is plenty — the script's slowest path (up + wait) is bounded by UP_TIMEOUT_SECS (default 15m)."
  type        = number
  default     = 3600
}
