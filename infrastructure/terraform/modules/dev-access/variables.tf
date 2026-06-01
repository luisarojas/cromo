variable "env" {
  type        = string
  description = "Environment slug (e.g. \"dev\")."
}

variable "region" {
  type        = string
  description = "AWS region the dev resources live in."
}

variable "account_id" {
  type        = string
  description = "AWS account ID hosting the dev resources."
}

variable "usernames" {
  type        = list(string)
  description = "IAM user names to create with dev-laptop permissions."
}

variable "app_secret_arn" {
  type        = string
  description = "ARN of the Secrets Manager secret holding app runtime config (e.g. cromo/dev/app)."
}

variable "instance_name_tag" {
  type        = string
  description = "Name tag of the EC2 instances ssm:StartSession is allowed against."
}
