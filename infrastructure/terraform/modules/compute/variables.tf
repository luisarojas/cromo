variable "env" { type = string }
variable "region" { type = string }
variable "hostname" {
  description = "Public hostname this environment answers on (e.g. dev.cromotrade.ca)."
  type        = string
}
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "alb_sg_id" { type = string }
variable "app_sg_id" { type = string }
variable "route53_zone_id" { type = string }
variable "secret_arn" {
  description = "ARN of the Secrets Manager entry the instance will read at boot."
  type        = string
}
variable "uploads_bucket" { type = string }
variable "uploads_bucket_arn" { type = string }
variable "ecr_registry" {
  description = "Account-scoped ECR registry URL (e.g. 123456789.dkr.ecr.ca-central-1.amazonaws.com)."
  type        = string
}
variable "instance_type" {
  type    = string
  default = "t3.small"
}
