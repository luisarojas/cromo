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

# ─── Namecheap Private Email (inbound mailboxes on cromotrade.ca) ────────────
# Paid mailbox hosting for support@, dmarc@, etc., bought from the same
# vendor that holds the domain registration. Two-step bootstrap:
#   1. Buy Private Email Starter in the Namecheap account, set
#      enable_namecheap_mail = true in tfvars, apply → publishes MX +
#      autodiscover records. Namecheap auto-verifies the domain once it
#      sees the MX point at privateemail.com.
#   2. Enable DKIM in Namecheap's Private Email admin, paste the
#      selector + public key into tfvars, apply again → publishes the
#      DKIM TXT.
# See modules/namecheap-mail/main.tf for the full sequence.
#
# The zoho-mail module on disk is intentionally left in place but
# disabled, in case the operator ever wants to switch back to Zoho. The
# Namecheap toggle (this one) is the active configuration.

module "namecheap_mail" {
  count           = var.enable_namecheap_mail ? 1 : 0
  source          = "../../modules/namecheap-mail"
  domain          = var.apex_domain
  route53_zone_id = aws_route53_zone.apex.zone_id
  dkim_selector   = var.namecheap_dkim_selector
  dkim_public_key = var.namecheap_dkim_public_key
}

# ─── Apex SPF — composed from every active sender ────────────────────────────
# RFC 7208: exactly one v=spf1 record per name. SES is always included;
# spf.privateemail.com is included only when the Namecheap module is
# active. Any future provider goes in this same list — never as a
# second TXT.

locals {
  spf_includes = concat(
    ["amazonses.com"],
    length(module.namecheap_mail) > 0 ? [module.namecheap_mail[0].spf_include] : [],
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

# ─── GitHub Actions OIDC roles for scripts/dev-env.sh (the ops workflow) ─────
# Let the ops workflow start/stop an environment from CI without the
# MFA-gated `cromo` profile. Narrow (5 actions) and account-scoped, so they
# live in shared alongside the terraform-runner role. One role per env — dev
# and prod get distinct roles + distinct OIDC subjects (ops-dev / ops-prod)
# so a dev run can never touch prod resources (and vice versa).

module "ops_dev_runner" {
  source              = "../../modules/ops-runner"
  env                 = "dev"
  github_sub_patterns = var.ops_dev_sub_patterns
}

# Prod's app/RDS resources don't exist until env/prod is applied, but the
# role can be created ahead of time — it only references ARNs by name, not
# live resources. The prod workflow gates `down` behind a typed confirmation
# and the stricter `ops-prod` GitHub Environment (see the OIDC subject).
module "ops_prod_runner" {
  source              = "../../modules/ops-runner"
  env                 = "prod"
  github_sub_patterns = var.ops_prod_sub_patterns
}
