terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "cromo-${var.env}-cache"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "cromo-${var.env}-cache"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.cache_sg_id]
  apply_immediately    = true
}
