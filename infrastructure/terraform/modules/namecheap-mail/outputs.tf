output "spf_include" {
  description = "SPF include directive for Namecheap Private Email's sending infrastructure. env/shared splices this into the apex SPF record so both SES and Namecheap appear in a single TXT, as RFC 7208 requires."
  value       = "spf.privateemail.com"
}
