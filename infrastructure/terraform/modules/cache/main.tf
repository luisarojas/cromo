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

# Replication group covers both shapes: dev runs num_cache_clusters = 1 with
# failover disabled (single node, cheap); prod runs num_cache_clusters = 2
# with automatic_failover_enabled + multi_az_enabled so a node loss promotes
# the replica without app restart.
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "cromo-${var.env}-cache"
  description                = "Cromo ${var.env} Redis"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.node_type
  num_cache_clusters         = var.num_cache_clusters
  parameter_group_name       = "default.redis7"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [var.cache_sg_id]
  automatic_failover_enabled = var.automatic_failover_enabled
  multi_az_enabled           = var.multi_az_enabled
  apply_immediately          = true
}
