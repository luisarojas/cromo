output "application_tag" {
  description = "{ awsApplication = <arn> } — merge into provider default_tags so every resource joins the application."
  value       = aws_servicecatalogappregistry_application.this.application_tag
}

output "arn" { value = aws_servicecatalogappregistry_application.this.arn }
output "id" { value = aws_servicecatalogappregistry_application.this.id }
