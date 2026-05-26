terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# The hosted zone is created once, at the apex domain, and re-used across
# environments. Subdomain records (dev.cromotrade.ca, staging.cromotrade.ca)
# all live inside it. Pass create_zone=false from staging/prod so they don't
# try to recreate it.

resource "aws_route53_zone" "apex" {
  count = var.create_zone ? 1 : 0
  name  = var.apex_domain
}

data "aws_route53_zone" "apex" {
  count = var.create_zone ? 0 : 1
  name  = var.apex_domain
}

locals {
  zone_id = var.create_zone ? aws_route53_zone.apex[0].zone_id : data.aws_route53_zone.apex[0].zone_id
}

# Alias the environment hostname at the ALB.

resource "aws_route53_record" "app" {
  zone_id = local.zone_id
  name    = var.hostname
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
