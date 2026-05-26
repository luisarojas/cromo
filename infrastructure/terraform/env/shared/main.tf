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
