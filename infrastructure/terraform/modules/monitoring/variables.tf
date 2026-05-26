variable "env" { type = string }

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "alert_email" {
  description = "Email to subscribe to the alerts SNS topic. Empty = no subscriber."
  type        = string
  default     = ""
}

variable "db_identifier" { type = string }
variable "alb_arn_suffix" { type = string }
