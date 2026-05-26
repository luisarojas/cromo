terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# One JSON secret per environment, holding every value the app needs at
# runtime. The EC2 user-data script reads this and writes /etc/cromo/cromo.env
# so docker-compose.prod.yml can env_file: it.

resource "aws_secretsmanager_secret" "app" {
  name                    = "cromo/${var.env}/app"
  description             = "App runtime config for Cromo ${var.env}"
  recovery_window_in_days = var.env == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(var.values)
}
