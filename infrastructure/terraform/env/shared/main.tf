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

# ─── SES domain identity + DKIM + SPF + DMARC + MAIL FROM ─────────────────────
# Account-wide (SES identities are account-scoped). dev and prod reference the
# resulting identity ARN by deterministic format — no cross-state lookup.

module "ses" {
  source             = "../../modules/ses"
  domain             = var.apex_domain
  route53_zone_id    = aws_route53_zone.apex.zone_id
  region             = var.region
  dmarc_report_email = var.dmarc_report_email
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
