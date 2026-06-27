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

variable "enable_namecheap_mail" {
  description = <<-EOT
    Toggle the Namecheap Private Email DNS module on/off. Flip to true
    after buying Private Email Starter at Namecheap. When true, the
    module publishes MX + autodiscover records and the apex SPF picks
    up `include:spf.privateemail.com` automatically.
  EOT
  type        = bool
  default     = false
}

variable "namecheap_dkim_selector" {
  description = "DKIM selector Namecheap Private Email's admin UI shows when you enable DKIM. Default `default` matches Namecheap's convention; override if their UI shows something else."
  type        = string
  default     = "default"
}

variable "namecheap_dkim_public_key" {
  description = <<-EOT
    Base64 public key from Namecheap Private Email admin → Email
    Authentication → DKIM. Leave empty on the first apply (before
    DKIM is enabled there); set after enabling DKIM and re-apply
    to publish the DKIM TXT.
  EOT
  type        = string
  default     = ""
}

variable "tf_runner_sub_patterns" {
  description = <<-EOT
    GitHub OIDC sub-claim patterns the cromo-tf-runner role accepts.

    tf-shared and tf-dev apply on push to `main` via their GitHub
    Environments, so their subjects are `environment:tf-{shared,dev}`.

    tf-prod is gated on the git ref instead: the apply-prod job does NOT
    declare a GitHub Environment, so GitHub issues a REF-based subject
    (`ref:refs/tags/v0.2.0` on a release-tag push). That's why the prod
    pattern is `ref:refs/tags/v*` and NOT `environment:tf-prod:...` — an
    environment-scoped subject never carries the ref, so the old combined
    pattern could never match (STS denied every prod apply). This keeps
    the IAM-level "prod only from a v* release tag" gate, which is the
    equivalent of a Required Reviewer rule the Free plan doesn't expose on
    private repos. Keep `:ref:refs/tags/v*` — it's the gate.
  EOT
  type        = list(string)
  default = [
    "repo:luisarojas/cromo:environment:tf-shared",
    "repo:luisarojas/cromo:environment:tf-dev",
    "repo:luisarojas/cromo:ref:refs/tags/v*",
  ]
}
