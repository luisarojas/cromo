variable "env" {
  description = "Environment slug (dev / staging / prod). Used in resource names."
  type        = string
}

variable "enable" {
  description = "Master switch. Set to false in prod to skip scheduling entirely."
  type        = bool
  default     = true
}

variable "asg_name" {
  description = "Name of the autoscaling group to scale on the schedule."
  type        = string
}

variable "db_identifier" {
  description = "RDS instance identifier (e.g. cromo-dev-db) that EventBridge Scheduler will Start/Stop."
  type        = string
}

variable "db_arn" {
  description = "RDS instance ARN. Used to scope the IAM role's permissions."
  type        = string
}

variable "time_zone" {
  description = "IANA time zone for the schedule (e.g. America/Toronto)."
  type        = string
  default     = "America/Toronto"
}

variable "start_hour" {
  type    = number
  default = 9
}

variable "start_minute" {
  type    = number
  default = 0
}

variable "stop_hour" {
  type    = number
  default = 17
}

variable "stop_minute" {
  type    = number
  default = 0
}
