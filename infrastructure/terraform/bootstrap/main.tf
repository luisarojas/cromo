terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "cromo"
      ManagedBy = "terraform"
      Component = "bootstrap"
    }
  }
}

# ─── Remote state bucket ──────────────────────────────────────────────────────
# Created out of band — every other Terraform config references this bucket
# via backend "s3". Versioning + encryption are mandatory for any state bucket.

resource "aws_s3_bucket" "tfstate" {
  bucket = "cromo-tfstate-${var.account_id}"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── State lock table ─────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "tfstate_lock" {
  name         = "cromo-tfstate-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# ─── ECR repositories ─────────────────────────────────────────────────────────
# One repo per service. Both shared across environments — image tags
# (env-<sha>) carry the environment scope, not the repo.

resource "aws_ecr_repository" "backend" {
  name                 = "cromo-backend"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "cromo-frontend"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

# ─── GitHub OIDC provider ─────────────────────────────────────────────────────
# Account-scoped, one per AWS account. Per-env IAM roles trust this provider
# and gate access via the `sub` claim (repo + branch/tag pattern).

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS validates the OIDC token via the cert chain, but the API requires at
  # least one thumbprint. GitHub's has been stable since 2023.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# Keep only the 20 most-recent images per repo to control storage cost.
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 20 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name
  policy     = aws_ecr_lifecycle_policy.backend.policy
}
