output "route53_zone_id" {
  value = aws_route53_zone.apex.zone_id
}

output "route53_nameservers" {
  description = "Set these as the Namecheap custom nameservers for the apex domain (one-time)."
  value       = aws_route53_zone.apex.name_servers
}

output "ses_identity_arn" {
  value = module.ses.identity_arn
}
