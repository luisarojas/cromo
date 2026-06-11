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

variable "mfa_enforced_user_names" {
  description = "Account-wide IAM user names that must call APIs with MFA-protected credentials. Default covers the bootstrap admin (cromo-admin). Per-env operator users (e.g. the dev-access module) attach their own copy of the policy."
  type        = list(string)
  default     = ["cromo-admin"]
}

variable "tf_runner_sub_patterns" {
  description = "GitHub OIDC sub-claim patterns the cromo-tf-runner role accepts. One pattern per GitHub Environment the Terraform workflow uses."
  type        = list(string)
  default = [
    "repo:Luisarojas/cromo:environment:tf-shared",
    "repo:Luisarojas/cromo:environment:tf-dev",
    "repo:Luisarojas/cromo:environment:tf-prod",
  ]
}
