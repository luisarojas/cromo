output "spf_include" {
  description = "SPF include directive for Zoho's data centre (e.g. `zoho.com`, `zoho.eu`). env/shared splices this into the apex SPF record so both SES and Zoho appear in a single TXT, as RFC 7208 requires."
  value       = local.spf_include
}
