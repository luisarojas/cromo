variable "env" { type = string }
variable "region" { type = string }
variable "hostname" {
  description = "Public hostname this environment answers on (e.g. dev.cromotrade.ca)."
  type        = string
}
variable "vpc_id" { type = string }
variable "alb_subnet_ids" {
  description = "Public subnet IDs the ALB attaches to (one per AZ)."
  type        = list(string)
}
variable "app_subnet_ids" {
  description = "Subnet IDs the EC2 ASG launches in. Should be private subnets — the ALB SG is the only thing allowed to reach 3000/3001."
  type        = list(string)
}
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

variable "deletion_protection" {
  description = "Whether to enable deletion protection on the ALB. Set true for prod."
  type        = bool
  default     = false
}
