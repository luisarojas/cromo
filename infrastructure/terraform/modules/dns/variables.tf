variable "apex_domain" {
  description = "Apex registered domain. The hosted zone is provisioned by env/shared; this module just looks it up."
  type        = string
}

variable "hostname" {
  description = "Fully-qualified hostname to point at this env's ALB (e.g. dev.cromotrade.ca)."
  type        = string
}

variable "alb_dns_name" { type = string }
variable "alb_zone_id" { type = string }
