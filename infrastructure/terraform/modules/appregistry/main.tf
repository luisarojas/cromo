# Service Catalog AppRegistry application backing the AWS console "myApplications"
# dashboard (cost, CloudWatch metrics/alarms, Resource Groups). Resources join it
# automatically by carrying the `awsApplication` tag this resource emits via its
# `application_tag` output — wired into the caller's provider default_tags.
#
# MUST be created by a provider whose default_tags do NOT already include the
# application_tag, otherwise the application would tag itself with its own output
# and Terraform reports a provider/resource dependency cycle. The env configs
# pass a dedicated aliased provider for exactly this reason.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

resource "aws_servicecatalogappregistry_application" "this" {
  name        = var.name
  description = var.description
}
