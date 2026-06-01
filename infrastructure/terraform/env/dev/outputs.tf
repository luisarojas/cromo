output "hostname" { value = "https://${module.dns.fqdn}" }
output "alb_dns_name" { value = module.compute.alb_dns_name }
output "ecr_backend_url" { value = "${var.ecr_registry}/cromo-backend" }
output "ecr_frontend_url" { value = "${var.ecr_registry}/cromo-frontend" }
output "uploads_bucket" { value = module.storage.uploads_bucket }
output "cognito_user_pool_id" { value = module.auth.user_pool_id }
output "cognito_client_id" { value = module.auth.client_id }
output "database_endpoint" { value = module.database.endpoint }
output "github_actions_deploy_role_arn" {
  description = "Paste into the GitHub repo secret AWS_DEPLOY_ROLE_ARN."
  value       = module.cicd.deploy_role_arn
}
output "application_arn" {
  description = "cromo-dev myApplications (AppRegistry) application ARN."
  value       = module.appregistry.arn
}
output "developer_iam_user_arns" {
  description = "ARNs of IAM users created for laptop access to dev (SSM port-forward + Secrets Manager read). Create access keys for each in the AWS console after apply."
  value       = module.dev_access.user_arns
}
