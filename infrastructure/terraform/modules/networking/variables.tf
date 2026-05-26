variable "env" {
  description = "Environment slug (dev / staging / prod) — used in resource names."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}
