variable "env" {
  description = "Environment name (dev, prod) — used to namespace the queue."
  type        = string
}

variable "bounce_topic_arn" {
  description = "SES bounce-events SNS topic ARN (created in env/shared)."
  type        = string
}

variable "complaint_topic_arn" {
  description = "SES complaint-events SNS topic ARN (created in env/shared)."
  type        = string
}

variable "consumer_role_name" {
  description = "IAM role name of the EC2 instance role that polls the queue (compute module's iam_role_name output)."
  type        = string
}
