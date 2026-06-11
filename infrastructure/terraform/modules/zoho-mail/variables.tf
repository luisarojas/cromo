variable "domain" {
  description = "Apex domain to add Zoho records to (e.g. cromotrade.ca)."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted zone ID where the Zoho records are created."
  type        = string
}

variable "verification_token" {
  description = <<-EOT
    The `zb<digits>` hostname prefix Zoho shows in its admin UI when you
    pick the CNAME verification method. Paste it as-is: `zb12345678`.
    The module creates a CNAME at `<token>.cromotrade.ca → zmverify.zoho.com`.

    If Zoho's UI defaults to the TXT-on-apex method, switch to "CNAME
    Method" in the dropdown — TXT-on-apex would collide with the apex
    SPF record this codebase already owns.
  EOT
  type        = string
}

variable "data_center" {
  description = "Zoho data centre region picked during signup. Determines which MX hostnames Zoho serves inbound from."
  type        = string
  default     = "com"

  validation {
    condition     = contains(["com", "eu", "in", "com_au"], var.data_center)
    error_message = "data_center must be one of: com (US, default), eu, in, com_au."
  }
}

variable "dkim_selector" {
  description = "Selector Zoho generates for the DKIM record. Defaults to `zoho` — match whatever the Zoho admin UI shows."
  type        = string
  default     = "zoho"
}

variable "dkim_public_key" {
  description = <<-EOT
    Base64 public key from Zoho's "Email Authentication → DKIM" page.
    Leave empty until you've enabled DKIM in Zoho's UI — when empty,
    the DKIM TXT record is not created (count = 0), so you can apply
    everything else first and circle back.

    Paste only the base64 body — the module wraps it as
    `v=DKIM1; k=rsa; p=<value>`.
  EOT
  type        = string
  default     = ""
}
