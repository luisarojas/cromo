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
      Env       = "dev"
      ManagedBy = "terraform"
    }
  }
}

locals {
  env      = "dev"
  hostname = "dev.${var.apex_domain}"
}

# ─── Networking ───────────────────────────────────────────────────────────────

module "networking" {
  source            = "../../modules/networking"
  env               = local.env
  alb_ingress_cidrs = var.alb_ingress_cidrs
}

# ─── DNS (looks up the hosted zone owned by env/shared) ───────────────────────

module "dns" {
  source       = "../../modules/dns"
  apex_domain  = var.apex_domain
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
  instance_class        = "db.t3.micro"
  multi_az              = false
  backup_retention_days = 7
  deletion_protection   = false
}

# ─── Cache ────────────────────────────────────────────────────────────────────

module "cache" {
  source             = "../../modules/cache"
  env                = local.env
  private_subnet_ids = module.networking.private_subnet_ids
  cache_sg_id        = module.networking.cache_sg_id
}

# ─── Storage ──────────────────────────────────────────────────────────────────

module "storage" {
  source               = "../../modules/storage"
  env                  = local.env
  account_id           = var.account_id
  cors_allowed_origins = ["https://${local.hostname}"]
  deletion_protection  = false
}

# ─── CDN (CloudFront in front of the uploads bucket) ──────────────────────────
# Dev keeps the default *.cloudfront.net hostname — no ACM cert needed. Prod
# layers a custom CNAME via cdn_hostname + acm_certificate_arn.

module "cdn" {
  source                         = "../../modules/cdn"
  env                            = local.env
  uploads_bucket_name            = module.storage.uploads_bucket
  uploads_bucket_arn             = module.storage.uploads_bucket_arn
  uploads_bucket_regional_domain = module.storage.uploads_bucket_regional_domain
}

# ─── Cognito ──────────────────────────────────────────────────────────────────
# SES identity lives in env/shared. We reference it by its deterministic ARN
# so we don't need a cross-state data source.

module "auth" {
  source              = "../../modules/auth"
  env                 = local.env
  from_email          = "no-reply@${var.apex_domain}"
  ses_identity_arn    = "arn:aws:ses:${var.region}:${var.account_id}:identity/${var.apex_domain}"
  admin_emails        = var.admin_emails
  admin_temp_password = var.admin_temp_password
}

# ─── Secrets ──────────────────────────────────────────────────────────────────
# Materialise the env vars the app needs at runtime. The secret is read by
# user-data and written to /etc/cromo/cromo.env for docker-compose.

module "secrets" {
  source = "../../modules/secrets"
  env    = local.env
  values = {
    NODE_ENV     = "production"
    APP_VERSION  = "0.0.0-dev"
    DATABASE_URL = module.database.connection_url
    REDIS_URL    = module.cache.redis_url

    AUTH_MODE            = "local"
    JWT_SECRET           = var.jwt_secret
    COGNITO_USER_POOL_ID = module.auth.user_pool_id
    COGNITO_CLIENT_ID    = module.auth.client_id
    COGNITO_REGION       = var.region

    EMAIL_FROM = "no-reply@${var.apex_domain}"
    # SES uses the IAM role rather than SMTP creds — leave SMTP_* unset so
    # the SES transport is selected at the nodemailer layer.
    FRONTEND_URL = "https://${local.hostname}"
    CORS_ORIGIN  = "https://${local.hostname}"

    GROQ_API_KEY = var.groq_api_key
    JOBS_MODE    = "enabled"

    UPLOADS_DRIVER     = "s3"
    UPLOADS_BUCKET     = module.storage.uploads_bucket
    UPLOADS_REGION     = var.region
    UPLOADS_PUBLIC_URL = module.cdn.uploads_url
    AWS_REGION         = var.region
  }
}

# ─── Compute (depends on every other module) ──────────────────────────────────

module "compute" {
  source             = "../../modules/compute"
  env                = local.env
  region             = var.region
  hostname           = local.hostname
  vpc_id             = module.networking.vpc_id
  alb_subnet_ids     = module.networking.public_subnet_ids
  app_subnet_ids     = module.networking.private_subnet_ids
  alb_sg_id          = module.networking.alb_sg_id
  app_sg_id          = module.networking.app_sg_id
  route53_zone_id    = module.dns.zone_id
  secret_arn         = module.secrets.secret_arn
  uploads_bucket     = module.storage.uploads_bucket
  uploads_bucket_arn = module.storage.uploads_bucket_arn
  ecr_registry       = var.ecr_registry
  instance_type      = "t3.small"
}

# ─── Monitoring ───────────────────────────────────────────────────────────────

module "monitoring" {
  source             = "../../modules/monitoring"
  env                = local.env
  log_retention_days = 7
  alert_email        = var.alert_email
  db_identifier      = module.database.identifier
  alb_arn_suffix     = module.compute.alb_arn_suffix
}

# ─── Business-hours schedule (dev only) ───────────────────────────────────────
# Scales the ASG to 0 and stops RDS outside Mon-Fri 08:00-19:00 ET, cutting
# dev cost from ~$55-60/mo to ~$20-25/mo. See infrastructure.md §19.2.2.
# MUST stay disabled for prod.

module "scheduling" {
  source        = "../../modules/scheduling"
  env           = local.env
  enable        = true
  asg_name      = module.compute.asg_name
  db_identifier = module.database.identifier
  db_arn        = module.database.arn

  days       = "MON-SUN"
  start_hour = 7
  stop_hour  = 23
}

# ─── CI/CD deploy role for GitHub Actions ─────────────────────────────────────
# Dev trusts every push to main. See modules/cicd/variables.tf for the sub
# pattern syntax.

module "cicd" {
  source = "../../modules/cicd"
  env    = local.env
  github_sub_patterns = [
    "repo:${var.github_repo}:ref:refs/heads/main",
    "repo:${var.github_repo}:environment:dev",
  ]
  uploads_bucket_arn = module.storage.uploads_bucket_arn
}
