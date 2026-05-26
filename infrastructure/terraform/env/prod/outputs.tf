output "hostname" { value = "https://${module.dns.fqdn}" }
output "alb_dns_name" { value = module.compute.alb_dns_name }
output "ecr_backend_url" { value = "${var.ecr_registry}/cromo-backend" }
output "ecr_frontend_url" { value = "${var.ecr_registry}/cromo-frontend" }
output "uploads_bucket" { value = module.storage.uploads_bucket }
output "cognito_user_pool_id" { value = module.auth.user_pool_id }
output "cognito_client_id" { value = module.auth.client_id }
output "database_endpoint" { value = module.database.endpoint }
