terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# Manages every DNS record Zoho Mail requires on the apex domain:
#   - verification TXT (one-time, after Zoho signup)
#   - MX records pointing at Zoho's inbound MTAs
#   - DKIM TXT (for outbound mail authenticated from Zoho's servers)
#
# Things this module deliberately does NOT manage:
#   - Apex SPF.  That's owned at env/shared so it can compose multiple
#     providers into the single record RFC 7208 requires. This module
#     exposes a `spf_include` output (zoho.com) that env/shared splices in.
#   - The Zoho account, mailboxes, or DKIM key generation.  There is no
#     first-party Terraform provider for Zoho Mail. Account creation,
#     enabling DKIM (which generates the key value below), and creating
#     mailboxes happen once in Zoho's admin UI; their outputs become
#     variable values here.
#
# Order of operations to bring a new domain up:
#   1. Sign up at zoho.com/mail, add cromotrade.ca, pick the data centre.
#   2. Copy the verification token from the Zoho UI → set
#      `var.verification_token` in env/shared/terraform.tfvars.
#   3. `terraform apply` — verification TXT + MX records land. SPF
#      automatically includes zoho.com because env/shared sees this
#      module is instantiated.
#   4. Click "Verify domain" in Zoho UI. Then in Zoho admin, enable DKIM.
#   5. Copy the DKIM public key from Zoho UI → set
#      `var.dkim_public_key` in env/shared/terraform.tfvars.
#   6. `terraform apply` again — DKIM TXT lands. Click "Verify DKIM" in
#      Zoho UI.
#   7. Create mailboxes in Zoho admin (support, dmarc, etc.) — those are
#      Zoho-side resources, not DNS, so they live outside Terraform.

# Zoho's inbound MTAs differ per data centre. The default (com) matches
# the free-plan US data centre Zoho assigns by default; switch to "eu"
# or "in" if the user picked a different region during signup.
locals {
  mx_hostnames = {
    com = ["mx.zoho.com", "mx2.zoho.com", "mx3.zoho.com"]
    eu  = ["mx.zoho.eu", "mx2.zoho.eu", "mx3.zoho.eu"]
    in  = ["mx.zoho.in", "mx2.zoho.in", "mx3.zoho.in"]
    com_au = ["mx.zoho.com.au", "mx2.zoho.com.au", "mx3.zoho.com.au"]
  }

  selected_mx = local.mx_hostnames[var.data_center]
  spf_include = "zoho.${var.data_center == "com_au" ? "com.au" : var.data_center}"
}

# 1) Domain verification — proves to Zoho we own the domain. Uses the
#    CNAME method (not TXT-on-apex) to avoid colliding with the apex SPF
#    record. The subdomain `<token>.cromotrade.ca` is unique per signup
#    so there's no contention with anything else. Once Zoho's UI shows
#    "Verified" this record can be deleted, but we leave it for
#    idempotency on re-apply.
resource "aws_route53_record" "verification" {
  zone_id = var.route53_zone_id
  name    = "${var.verification_token}.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["zmverify.zoho.com"]
}

# 2) MX records — three priorities give Zoho server-side failover.
#    Apex MX coexists with the existing A/ALIAS pointing at the ALB;
#    different record types share a name fine.
resource "aws_route53_record" "mx" {
  zone_id = var.route53_zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 300
  records = [
    "10 ${local.selected_mx[0]}",
    "20 ${local.selected_mx[1]}",
    "50 ${local.selected_mx[2]}",
  ]
}

# 3) DKIM — only created once the operator has enabled DKIM in Zoho's
#    admin UI and pasted the public key into terraform.tfvars. Until
#    then, dkim_public_key is "" and this resource isn't created.
resource "aws_route53_record" "dkim" {
  count   = var.dkim_public_key == "" ? 0 : 1
  zone_id = var.route53_zone_id
  name    = "${var.dkim_selector}._domainkey.${var.domain}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DKIM1; k=rsa; p=${var.dkim_public_key}"]
}
