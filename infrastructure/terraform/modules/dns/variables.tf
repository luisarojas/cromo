variable "apex_domain" {
  description = "Apex registered domain — for Cromo this is cromotrade.ca."
  type        = string
}

variable "create_zone" {
  description = "Create the hosted zone (only true in the first env that runs)."
  type        = bool
  default     = false
}

variable "hostname" {
  description = "Fully-qualified hostname to point at the ALB (e.g. dev.cromotrade.ca)."
  type        = string
}

variable "alb_dns_name" { type = string }
variable "alb_zone_id" { type = string }
