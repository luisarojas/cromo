variable "domain" {
  description = "Domain to verify in SES (cromotrade.ca)."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted zone ID where SES DNS records will be created."
  type        = string
}

variable "region" {
  type    = string
  default = "ca-central-1"
}

variable "dmarc_report_email" {
  description = "Aggregate DMARC reports recipient."
  type        = string
}
