variable "domain" {
  description = "Apex domain to add Namecheap Private Email records to (e.g. cromotrade.ca)."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted zone ID where the Namecheap records are created."
  type        = string
}

variable "dkim_selector" {
  description = <<-EOT
    DKIM selector Namecheap shows you when you enable DKIM in the
    Private Email admin UI. Defaults to `default` (Namecheap's
    convention), but their UI sometimes uses a different value such
    as `pmta`. Match whatever the admin UI shows; mismatches mean
    receiving servers can't find the public key.
  EOT
  type        = string
  default     = "default"
}

variable "dkim_public_key" {
  description = <<-EOT
    Base64 public key from Namecheap's Private Email admin →
    Email Authentication → DKIM page. Leave empty on the first apply
    (before DKIM is enabled in their UI); set after enabling DKIM and
    re-apply to publish the DKIM TXT.

    Paste only the base64 body — the module wraps it as
    `v=DKIM1; k=rsa; p=<value>`. Strip any leading `v=DKIM1; k=rsa; p=`
    that Namecheap includes for copy-paste convenience.
  EOT
  type        = string
  default     = ""
}
