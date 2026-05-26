terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# This module assumes the hosted zone already exists (provisioned by
# env/shared). It looks the zone up by name and writes a single A-alias
# record pointing this env's hostname at the env's ALB.

data "aws_route53_zone" "apex" {
  name = var.apex_domain
}

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.apex.zone_id
  name    = var.hostname
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
