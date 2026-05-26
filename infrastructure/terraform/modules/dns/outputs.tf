output "zone_id" { value = local.zone_id }
output "fqdn" { value = aws_route53_record.app.fqdn }

output "nameservers" {
  description = "Set these as the Namecheap custom nameservers for cromotrade.ca."
  value       = var.create_zone ? aws_route53_zone.apex[0].name_servers : []
}
