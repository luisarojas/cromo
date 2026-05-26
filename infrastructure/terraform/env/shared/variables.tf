variable "region" {
  type    = string
  default = "ca-central-1"
}

variable "apex_domain" {
  description = "Apex registered domain (cromotrade.ca). Stable forever — changing this means moving the entire org to a different domain."
  type        = string
  default     = "cromotrade.ca"
}

variable "dmarc_report_email" {
  description = "Aggregate DMARC reports recipient. Personal inbox is fine during early operation; switch to a distribution list before launch."
  type        = string
}
