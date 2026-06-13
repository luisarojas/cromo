terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# Manages every DNS record Namecheap Private Email requires on the
# apex domain:
#   - MX records pointing at Namecheap's inbound MTAs (privateemail.com)
#   - DKIM TXT (for outbound mail authenticated from their servers)
#
# Things this module deliberately does NOT manage:
#   - Apex SPF. That's owned at env/shared so it can compose multiple
#     providers into the single record RFC 7208 requires. This module
#     exposes a `spf_include` output (spf.privateemail.com) that
#     env/shared splices in.
#   - The Namecheap account, the Private Email subscription, mailboxes,
#     aliases, or DKIM key generation. There is no Terraform provider
#     for Namecheap Private Email. Mailbox + alias creation happens in
#     the Namecheap Private Email admin UI; DKIM keys are generated
#     there too. Their outputs become the variable values here.
#
# Domain verification: Namecheap Private Email considers a domain
# "verified" once the MX records point at their servers — there's no
# separate TXT verification step, unlike Zoho's CNAME flow. The first
# `terraform apply` is therefore sufficient to satisfy Namecheap's
# admin-side checks (after DNS propagation).
#
# Order of operations to bring a new domain up:
#   1. Buy Private Email Starter from Namecheap (≈ $11/yr, one mailbox).
#   2. In Namecheap account → Private Email → set up Inbox →
#      add the domain `cromotrade.ca`.
#   3. Set `var.enable` to true in env/shared/terraform.tfvars and apply.
#      MX records publish; Namecheap's verifier sees them.
#   4. In Namecheap Private Email admin, create the primary mailbox
#      (e.g. luisa@cromotrade.ca) and the two aliases (support, dmarc).
#   5. In Namecheap admin → DKIM, generate a key. Copy the selector and
#      public key. Set `var.dkim_selector` and `var.dkim_public_key` in
#      env/shared/terraform.tfvars and apply again.
#   6. Verify DKIM in the Namecheap admin.

# Namecheap Private Email's inbound MTAs. Both records share priority 10
# so Namecheap can load-balance receiving across them — this matches
# their published recommended config.
resource "aws_route53_record" "mx" {
  zone_id = var.route53_zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 300
  records = [
    "10 mx1.privateemail.com",
    "10 mx2.privateemail.com",
  ]
}

# Optional Autodiscover record so desktop mail clients (Apple Mail,
# Outlook) can auto-configure IMAP/SMTP without the user typing server
# hostnames. Pure UX win — has no impact on deliverability.
resource "aws_route53_record" "autodiscover" {
  zone_id = var.route53_zone_id
  name    = "autodiscover.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["privateemail.com"]
}

# Optional Autoconfig record for Thunderbird's auto-configuration flow.
# Same UX-only role as autodiscover above.
resource "aws_route53_record" "autoconfig" {
  zone_id = var.route53_zone_id
  name    = "autoconfig.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["privateemail.com"]
}

# DKIM TXT — created only after the operator has enabled DKIM in
# Namecheap's admin UI and pasted the selector + public key here.
# Without it, outbound mail still flows but isn't DKIM-signed, which
# materially hurts deliverability and DMARC alignment. Add it.
#
# 2048-bit DKIM keys produce a TXT value ~440 chars after the v=DKIM1
# wrapper — well past DNS's 255-char-per-string limit (RFC 1035). Route
# 53 (and resolvers in general) accept multiple quoted strings inside
# one TXT record; resolvers concatenate them transparently. We split
# the value into 255-char chunks and emit `"chunk1" "chunk2" ...`
# accordingly. Without this split, Route 53 rejects the change with
# `CharacterStringTooLong`.
locals {
  dkim_full   = "v=DKIM1; k=rsa; p=${var.dkim_public_key}"
  dkim_chunks = [for i in range(0, length(local.dkim_full), 255) : substr(local.dkim_full, i, 255)]
  # `\" \"` between chunks → AWS Route 53 sees the value as multiple
  # 255-char strings within one TXT record. Outer quotes are NOT added
  # here — the AWS provider wraps the whole value in quotes on the way
  # to the API; adding them ourselves doubles them up and trips the
  # InvalidCharacterString validator.
  dkim_value = join("\" \"", local.dkim_chunks)
}

resource "aws_route53_record" "dkim" {
  count   = var.dkim_public_key == "" ? 0 : 1
  zone_id = var.route53_zone_id
  name    = "${var.dkim_selector}._domainkey.${var.domain}"
  type    = "TXT"
  ttl     = 300
  records = [local.dkim_value]
}
