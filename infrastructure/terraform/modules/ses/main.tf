terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

resource "aws_ses_domain_identity" "main" {
  domain = var.domain
}

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

# Publish DKIM records into Route 53 so verification happens automatically.
resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = var.route53_zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# SPF — minimal "allow SES" record. Adjust if you also send mail from other providers.
resource "aws_route53_record" "spf" {
  zone_id = var.route53_zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com -all"]
}

# DMARC — start in `quarantine; pct=10` so a small slice of failing mail is
# quarantined while we observe aggregate reports. Tighten to p=quarantine
# pct=100 then p=reject once reports are clean for a week. Keeping p=none
# permanently signals to mailbox providers that we're not enforcing alignment,
# which is exactly what SES reviewers flag on borderline accounts.
resource "aws_route53_record" "dmarc" {
  zone_id = var.route53_zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=quarantine; pct=10; rua=mailto:${var.dmarc_report_email}; ruf=mailto:${var.dmarc_report_email}; fo=1"]
}

resource "aws_ses_domain_mail_from" "main" {
  domain           = aws_ses_domain_identity.main.domain
  mail_from_domain = "mail.${var.domain}"
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = var.route53_zone_id
  name    = aws_ses_domain_mail_from.main.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_txt" {
  zone_id = var.route53_zone_id
  name    = aws_ses_domain_mail_from.main.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com -all"]
}

# ─── Account-level suppression list ──────────────────────────────────────────
# Tells SES to suppress addresses that hard-bounce or complain at the ACCOUNT
# level, independently of our app-side suppression table. Belt-and-braces:
# even if a code bug bypasses our table, SES itself refuses the second send.
# This is one of the explicit signals SES reviewers look for during
# production-access reviews.

resource "aws_sesv2_account_suppression_attributes" "main" {
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

# ─── Bounce + complaint SNS topics ───────────────────────────────────────────
# SES writes every bounce and complaint event to SNS. SNS fans out to the
# backend's /api/v1/internal/ses/notifications endpoint (HTTPS subscription
# below), which writes to email_suppressions and skips future sends to the
# affected addresses.

resource "aws_sns_topic" "ses_bounces" {
  name = "cromo-ses-bounces"
}

resource "aws_sns_topic" "ses_complaints" {
  name = "cromo-ses-complaints"
}

# Allow SES to publish into these topics.
resource "aws_sns_topic_policy" "ses_bounces" {
  arn    = aws_sns_topic.ses_bounces.arn
  policy = data.aws_iam_policy_document.ses_publish_bounces.json
}

resource "aws_sns_topic_policy" "ses_complaints" {
  arn    = aws_sns_topic.ses_complaints.arn
  policy = data.aws_iam_policy_document.ses_publish_complaints.json
}

data "aws_iam_policy_document" "ses_publish_bounces" {
  statement {
    sid     = "AllowSesPublish"
    effect  = "Allow"
    actions = ["SNS:Publish"]
    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }
    resources = [aws_sns_topic.ses_bounces.arn]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

data "aws_iam_policy_document" "ses_publish_complaints" {
  statement {
    sid     = "AllowSesPublish"
    effect  = "Allow"
    actions = ["SNS:Publish"]
    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }
    resources = [aws_sns_topic.ses_complaints.arn]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

data "aws_caller_identity" "current" {}

# SESv2 configuration set + event destinations route Bounce/Complaint events
# into the SNS topics. Every send in production uses this configuration set.
resource "aws_sesv2_configuration_set" "main" {
  configuration_set_name = "cromo-default"

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }
}

resource "aws_sesv2_configuration_set_event_destination" "bounces" {
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  event_destination_name = "bounces-to-sns"
  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE"]
    sns_destination {
      topic_arn = aws_sns_topic.ses_bounces.arn
    }
  }
}

resource "aws_sesv2_configuration_set_event_destination" "complaints" {
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  event_destination_name = "complaints-to-sns"
  event_destination {
    enabled              = true
    matching_event_types = ["COMPLAINT"]
    sns_destination {
      topic_arn = aws_sns_topic.ses_complaints.arn
    }
  }
}

# Per-env HTTPS subscriptions on these topics are NOT defined here — they
# live in env/dev/main.tf and env/prod/main.tf because the endpoint URL is
# environment-specific (dev.cromotrade.ca vs cromotrade.ca) and the
# subscription only works once the env's backend is live to confirm the
# SNS handshake. The backend webhook auto-confirms on first POST (see
# routes/v1/ses-notifications.ts).
