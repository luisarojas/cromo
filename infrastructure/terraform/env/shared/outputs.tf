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

output "ses_bounce_topic_arn" {
  value = module.ses.bounce_topic_arn
}

output "ses_complaint_topic_arn" {
  value = module.ses.complaint_topic_arn
}

output "ses_configuration_set_name" {
  value = module.ses.configuration_set_name
}

output "tf_runner_role_arn" {
  description = "Set this as the GitHub repo secret AWS_TF_RUNNER_ROLE_ARN."
  value       = module.terraform_runner.role_arn
}

output "ops_dev_role_arn" {
  description = "Set this as the GitHub repo secret AWS_OPS_DEV_ROLE_ARN."
  value       = module.ops_dev_runner.role_arn
}

output "ops_prod_role_arn" {
  description = "Set this as the GitHub repo secret AWS_OPS_PROD_ROLE_ARN."
  value       = module.ops_prod_runner.role_arn
}
