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

variable "zoho_verification_token" {
  description = <<-EOT
    The zb<digits> token Zoho shows in its admin UI after you add
    cromotrade.ca during signup. Leave empty to disable the Zoho module
    entirely (no MX, no SPF include, no DKIM). Setting this is what
    "turns on" the module — count=0 → count=1 in the env/shared instantiation.
  EOT
  type        = string
  default     = ""
}

variable "zoho_data_center" {
  description = "Zoho data centre region (com / eu / in / com_au). Must match what you picked during signup, otherwise inbound mail bounces."
  type        = string
  default     = "com"
}

variable "zoho_dkim_public_key" {
  description = <<-EOT
    Base64 public key from Zoho's "Email Authentication → DKIM" page.
    Leave empty on the first apply (before DKIM is enabled in Zoho UI);
    set after enabling DKIM and re-apply to publish the DKIM TXT.
  EOT
  type        = string
  default     = ""
}

variable "tf_runner_sub_patterns" {
  description = <<-EOT
    GitHub OIDC sub-claim patterns the cromo-tf-runner role accepts.

    tf-shared and tf-dev apply on push to `main` and have no extra ref
    constraint. tf-prod combines `environment:tf-prod` with
    `ref:refs/tags/v*` so even a misconfigured workflow can't apply
    prod without a v-prefix tag pushed by `scripts/release.sh`. This
    is the IAM-level equivalent of a Required Reviewer protection
    rule (which the Free plan doesn't expose on private repos).
  EOT
  type        = list(string)
  default = [
    "repo:luisarojas/cromo:environment:tf-shared",
    "repo:luisarojas/cromo:environment:tf-dev",
    "repo:luisarojas/cromo:environment:tf-prod:ref:refs/tags/v*",
  ]
}
