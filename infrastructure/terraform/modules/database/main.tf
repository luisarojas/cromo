terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "cromo-${var.env}-db"
  subnet_ids = var.private_subnet_ids
  tags       = { Name = "cromo-${var.env}-db" }
}

resource "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier                   = "cromo-${var.env}-db"
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.instance_class
  allocated_storage            = 20
  max_allocated_storage        = 100
  storage_type                 = "gp3"
  storage_encrypted            = true
  db_name                      = "cromo"
  username                     = "cromo_admin"
  password                     = random_password.master.result
  db_subnet_group_name         = aws_db_subnet_group.main.name
  vpc_security_group_ids       = [var.db_sg_id]
  publicly_accessible          = false
  multi_az                     = var.multi_az
  backup_retention_period      = var.backup_retention_days
  deletion_protection          = var.deletion_protection
  skip_final_snapshot          = !var.deletion_protection
  apply_immediately            = true
  auto_minor_version_upgrade   = true
  performance_insights_enabled = false
}
