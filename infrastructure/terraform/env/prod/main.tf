terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "cromo"
      Env       = "prod"
      ManagedBy = "terraform"
    }
  }
}

locals {
  env      = "prod"
  hostname = var.apex_domain # production lives at the apex (cromotrade.ca)
}

# ─── Networking ───────────────────────────────────────────────────────────────
# Prod runs one NAT per AZ so an AZ outage doesn't sever outbound egress
# (Groq vision API, SES, ECR pulls) for the surviving AZ. Adds ~$32/mo for
# the second NAT — accepted for HA.

module "networking" {
  source             = "../../modules/networking"
  env                = local.env
  vpc_cidr           = "10.30.0.0/16" # distinct from dev (10.20.0.0/16) so future VPC peering doesn't conflict
  single_nat_gateway = false
}

# ─── DNS ──────────────────────────────────────────────────────────────────────
# Dev's terraform state owns the hosted zone; prod just looks it up.

module "dns" {
  source       = "../../modules/dns"
  apex_domain  = var.apex_domain
  create_zone  = false
  hostname     = local.hostname
  alb_dns_name = module.compute.alb_dns_name
  alb_zone_id  = module.compute.alb_zone_id
}

# ─── Database ─────────────────────────────────────────────────────────────────

module "database" {
  source                = "../../modules/database"
  env                   = local.env
  private_subnet_ids    = module.networking.private_subnet_ids
  db_sg_id              = module.networking.db_sg_id
  instance_class        = "db.t3.small" # one tier up from dev's t3.micro
  multi_az              = true
  backup_retention_days = 30
  deletion_protection   = true
}

# ─── Cache ────────────────────────────────────────────────────────────────────

module "cache" {
  source                     = "../../modules/cache"
  env                        = local.env
  private_subnet_ids         = module.networking.private_subnet_ids
  cache_sg_id                = module.networking.cache_sg_id
  num_cache_clusters         = 2 # primary + 1 replica
  automatic_failover_enabled = true
  multi_az_enabled           = true
  # cache.t3.micro is the spec's launch sizing — bump to t3.small if Redis
  # memory pressure shows up in CloudWatch.
}

# ─── Storage ──────────────────────────────────────────────────────────────────

module "storage" {
  source               = "../../modules/storage"
  env                  = local.env
  account_id           = var.account_id
  cors_allowed_origins = ["https://${local.hostname}"]
  deletion_protection  = true
}

# ─── SES ──────────────────────────────────────────────────────────────────────
# Domain identity is one per AWS account, so prod and dev share it. The first
# env to apply created it; subsequent applies are a no-op as long as the
# domain hasn't been deleted. Either env can re-render the DNS records
# idempotently. NOTE: only one Terraform state should "own" the SES identity
# to avoid resource conflicts — we let dev own it. Skip the module here.

# ─── Cognito ──────────────────────────────────────────────────────────────────

module "auth" {
  source              = "../../modules/auth"
  env                 = local.env
  from_email          = "no-reply@${var.apex_domain}"
  ses_identity_arn    = "arn:aws:ses:${var.region}:${var.account_id}:identity/${var.apex_domain}"
  deletion_protection = true
}

# ─── Secrets ──────────────────────────────────────────────────────────────────

module "secrets" {
  source = "../../modules/secrets"
  env    = local.env
  values = {
    NODE_ENV     = "production"
    APP_VERSION  = "0.0.0-prod"
    DATABASE_URL = module.database.connection_url
    REDIS_URL    = module.cache.redis_url

    AUTH_MODE            = "cognito"
    JWT_SECRET           = var.jwt_secret
    COGNITO_USER_POOL_ID = module.auth.user_pool_id
    COGNITO_CLIENT_ID    = module.auth.client_id
    COGNITO_REGION       = var.region

    EMAIL_FROM   = "no-reply@${var.apex_domain}"
    FRONTEND_URL = "https://${local.hostname}"
    CORS_ORIGIN  = "https://${local.hostname}"

    GROQ_API_KEY = var.groq_api_key # real key in prod — gate via tfvars
    JOBS_MODE    = "enabled"

    UPLOADS_BUCKET = module.storage.uploads_bucket
    AWS_REGION     = var.region
  }
}

# ─── Compute ──────────────────────────────────────────────────────────────────

module "compute" {
  source              = "../../modules/compute"
  env                 = local.env
  region              = var.region
  hostname            = local.hostname
  vpc_id              = module.networking.vpc_id
  alb_subnet_ids      = module.networking.public_subnet_ids
  app_subnet_ids      = module.networking.private_subnet_ids
  alb_sg_id           = module.networking.alb_sg_id
  app_sg_id           = module.networking.app_sg_id
  route53_zone_id     = module.dns.zone_id
  secret_arn          = module.secrets.secret_arn
  uploads_bucket      = module.storage.uploads_bucket
  uploads_bucket_arn  = module.storage.uploads_bucket_arn
  ecr_registry        = var.ecr_registry
  instance_type       = "t3.medium" # one tier up from dev's t3.small
  deletion_protection = true
}

# ─── Monitoring ───────────────────────────────────────────────────────────────

module "monitoring" {
  source             = "../../modules/monitoring"
  env                = local.env
  log_retention_days = 365 # spec target for prod
  alert_email        = var.alert_email
  db_identifier      = module.database.identifier
  alb_arn_suffix     = module.compute.alb_arn_suffix
}

# ─── Scheduling — MUST be disabled in prod ────────────────────────────────────
# Module renders zero resources when enable = false. Wired up anyway so a
# future toggle is a one-line change rather than a copy-paste from dev.

module "scheduling" {
  source        = "../../modules/scheduling"
  env           = local.env
  enable        = false
  asg_name      = module.compute.asg_name
  db_identifier = module.database.identifier
  db_arn        = module.database.arn
}

# ─── CI/CD deploy role for GitHub Actions ─────────────────────────────────────
# Prod trusts only v-prefix tag pushes — `git tag v1.0.0 && git push --tags`.
# Pushes to main can't assume this role; that's deliberate.

module "cicd" {
  source = "../../modules/cicd"
  env    = local.env
  github_sub_patterns = [
    "repo:${var.github_repo}:ref:refs/tags/v*",
  ]
  uploads_bucket_arn = module.storage.uploads_bucket_arn
}
