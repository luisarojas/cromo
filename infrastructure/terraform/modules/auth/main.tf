terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

resource "aws_cognito_user_pool" "main" {
  name = "cromo-${var.env}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  email_configuration {
    email_sending_account = "DEVELOPER"
    from_email_address    = var.from_email
    source_arn            = var.ses_identity_arn
  }

  schema {
    name                = "username"
    attribute_data_type = "String"
    mutable             = true
    required            = false
    string_attribute_constraints {
      min_length = 3
      max_length = 30
    }
  }

  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"
}

# ─── Admin group & users ──────────────────────────────────────────────────────

resource "aws_cognito_user_group" "admin" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = "admin"
  description  = "Application administrators — maps to role=admin in the backend."
}

resource "aws_cognito_user" "admin" {
  for_each     = toset(var.admin_emails)
  user_pool_id = aws_cognito_user_pool.main.id
  username     = each.value

  temporary_password = var.admin_temp_password
  message_action     = "SUPPRESS"

  attributes = {
    email          = each.value
    email_verified = "true"
  }
}

resource "aws_cognito_user_in_group" "admin" {
  for_each     = toset(var.admin_emails)
  user_pool_id = aws_cognito_user_pool.main.id
  group_name   = aws_cognito_user_group.admin.name
  username     = aws_cognito_user.admin[each.key].username
}

resource "aws_cognito_user_pool_client" "frontend" {
  name         = "cromo-${var.env}-frontend"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false # browser clients can't keep a secret

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  access_token_validity  = 15 # minutes
  id_token_validity      = 15 # minutes
  refresh_token_validity = 30 # days
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}
