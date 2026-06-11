terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "cromo"
      Env       = "shared"
      ManagedBy = "terraform"
    }
  }
}

# ─── Hosted zone ──────────────────────────────────────────────────────────────
# Account-wide, lives as long as the domain does. dev/prod look this up via
# data source — they never own it. Destroying dev or prod doesn't touch it.

resource "aws_route53_zone" "apex" {
  name = var.apex_domain
}

# ─── SES domain identity + DKIM + DMARC + MAIL FROM ──────────────────────────
# Account-wide (SES identities are account-scoped). dev and prod reference the
# resulting identity ARN by deterministic format — no cross-state lookup.
# Apex SPF is owned below, not by this module, so multiple providers can
# compose into the single TXT record RFC 7208 requires.

module "ses" {
  source             = "../../modules/ses"
  domain             = var.apex_domain
  route53_zone_id    = aws_route53_zone.apex.zone_id
  region             = var.region
  dmarc_report_email = var.dmarc_report_email
}

# ─── Zoho Mail (inbound mailboxes on cromotrade.ca) ──────────────────────────
# Free-tier mailboxes for support@, dmarc@, etc. Three-step bootstrap:
# sign up at Zoho → set zoho_verification_token in tfvars → apply →
# enable DKIM in Zoho UI → set zoho_dkim_public_key → apply again.
# See modules/zoho-mail/main.tf for the full sequence.
#
# count=0 keeps this disabled until Zoho is signed up. Toggle by setting
# zoho_verification_token to a real value in terraform.tfvars; the module
# then bootstraps the verification TXT + MX + (optional) DKIM records.

module "zoho_mail" {
  count               = var.zoho_verification_token == "" ? 0 : 1
  source              = "../../modules/zoho-mail"
  domain              = var.apex_domain
  route53_zone_id     = aws_route53_zone.apex.zone_id
  verification_token  = var.zoho_verification_token
  data_center         = var.zoho_data_center
  dkim_public_key     = var.zoho_dkim_public_key
}

# ─── Apex SPF — composed from every active sender ────────────────────────────
# RFC 7208: exactly one v=spf1 record per name. SES is always included;
# zoho.com (or .eu/.in) is included only when the Zoho module is active.
# Any future provider goes in this same list — never as a second TXT.

locals {
  spf_includes = concat(
    ["amazonses.com"],
    length(module.zoho_mail) > 0 ? [module.zoho_mail[0].spf_include] : [],
  )
  apex_spf_record = "v=spf1 ${join(" ", [for d in local.spf_includes : "include:${d}"])} -all"
}

resource "aws_route53_record" "apex_spf" {
  zone_id = aws_route53_zone.apex.zone_id
  name    = var.apex_domain
  type    = "TXT"
  ttl     = 600
  records = [local.apex_spf_record]
}

# ─── MFA enforcement on the bootstrap admin ───────────────────────────────────
# Attaches the canonical "deny-unless-MFA, allow self-MFA-management" inline
# policy to cromo-admin (and any other account-wide users listed). The user
# resource itself is NOT Terraform-managed — only the inline policy is. After
# apply, the admin must use `aws sts get-session-token` (or
# scripts/aws-mfa-session.sh) to mint MFA-protected temp creds before any
# other CLI call will succeed.

module "mfa_enforcement" {
  source      = "../../modules/iam-mfa-enforcement"
  user_names  = var.mfa_enforced_user_names
  policy_name = "cromo-shared-require-mfa"
}

# ─── GitHub Actions OIDC role for Terraform plan/apply ───────────────────────
# Lives in shared because (a) the IAM role is account-scoped, and (b) it
# manages all three stacks (shared/dev/prod) — there's no reason to mint
# three roles when one with three sub patterns does the same job. The
# required-reviewer protection on prod lives in the GitHub Environment
# settings, not in IAM.

module "terraform_runner" {
  source              = "../../modules/terraform-runner"
  github_sub_patterns = var.tf_runner_sub_patterns
}
