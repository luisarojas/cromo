terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

# Default provider used by every resource. default_tags carries the
# `awsApplication` tag emitted by the AppRegistry application below, so every
# resource auto-joins the cromo-dev myApplications dashboard.
provider "aws" {
  region = var.region

  default_tags {
    tags = merge({
      Project   = "cromo"
      Env       = "dev"
      ManagedBy = "terraform"
    }, module.appregistry.application_tag)
  }
}

# Dedicated provider for the AppRegistry application itself. Its default_tags
# omit application_tag to break the otherwise-circular dependency (an
# application can't tag itself with a value it hasn't produced yet).
provider "aws" {
  alias  = "appregistry"
  region = var.region

  default_tags {
    tags = {
      Project   = "cromo"
      Env       = "dev"
      ManagedBy = "terraform"
    }
  }
}

# Resolve the account ID and ECR registry without baking either into
# committed defaults. data.aws_caller_identity returns whichever account
# the provider is authenticated to, which is the right answer 100% of the
# time in single-account ops. The variables remain available as explicit
# overrides for multi-account scenarios but normally stay empty.
data "aws_caller_identity" "current" {}

locals {
  env          = "dev"
  hostname     = "dev.${var.apex_domain}"
  account_id   = var.account_id != "" ? var.account_id : data.aws_caller_identity.current.account_id
  ecr_registry = var.ecr_registry != "" ? var.ecr_registry : "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com"
}

# ─── myApplications (AWS console cost / metrics dashboard) ────────────────────

module "appregistry" {
  source    = "../../modules/appregistry"
  providers = { aws = aws.appregistry }
  name      = "cromo-dev"
}

# ─── Networking ───────────────────────────────────────────────────────────────

module "networking" {
  source            = "../../modules/networking"
  env               = local.env
  alb_ingress_cidrs = var.alb_ingress_cidrs

  # Dev has no NAT gateway (~$33/mo of pure idle cost). Instead the app
  # instance runs in a PUBLIC subnet with a public IP and egresses straight
  # through the internet gateway; its security group still only accepts
  # inbound from the ALB, so nothing is actually exposed. Managed data stores
  # (RDS) stay in the private subnets and need no egress. Prod leaves this
  # default true and keeps the app private behind per-AZ NATs.
  enable_nat_gateway = false
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
# Dev runs Redis as a Docker container in the compose stack on the app
# instance (see infrastructure/docker/docker-compose.prod.yml, `redis` service,
# gated behind the `local-redis` compose profile), NOT managed ElastiCache
# (~$12/mo). REDIS_URL below points at the in-compose service. Prod keeps the
# managed multi-AZ ElastiCache module. Redis holds only cache + ephemeral
# queue/live-room state, so losing it on the nightly instance recycle is fine.

# ─── Storage ──────────────────────────────────────────────────────────────────

module "storage" {
  source               = "../../modules/storage"
  env                  = local.env
  account_id           = local.account_id
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
  ses_identity_arn    = "arn:aws:ses:${var.region}:${local.account_id}:identity/${var.apex_domain}"
  admin_emails        = var.admin_emails
  admin_temp_password = var.admin_temp_password
}

# ─── Secrets ──────────────────────────────────────────────────────────────────
# Materialise the env vars the app needs at runtime. The secret is read by
# user-data and written to /etc/cromo/cromo.env for docker-compose.

module "secrets" {
  source = "../../modules/secrets"
  env    = local.env
  # SCAN_MODEL is only included when explicitly set. An empty-string value
  # would override the code-side default in scan.service.ts (it uses
  # env.SCAN_MODEL ?? DEFAULT_<PROVIDER>_MODEL) and force the API call to
  # model="", so the key must be absent from the env when unused.
  values = merge({
    NODE_ENV     = "production"
    APP_VERSION  = "0.0.0-dev"
    DATABASE_URL = module.database.connection_url
    # In-compose Redis container (see the Cache note above), not ElastiCache.
    REDIS_URL = "redis://redis:6379"

    AUTH_MODE            = "cognito"
    JWT_SECRET           = var.jwt_secret
    COGNITO_USER_POOL_ID = module.auth.user_pool_id
    COGNITO_CLIENT_ID    = module.auth.client_id
    COGNITO_REGION       = var.region
    COGNITO_TOKEN_USE    = "access"

    EMAIL_FROM = "Cromo <no-reply@${var.apex_domain}>"
    # SES uses the IAM role rather than SMTP creds — leave SMTP_* unset so
    # the SES transport is selected at the nodemailer layer.
    FRONTEND_URL = "https://${local.hostname}"
    CORS_ORIGIN  = "https://${local.hostname}"

    # SES bounce/complaint SQS queue URL. The backend's SES poller (see
    # services/ses-poller.service.ts) long-polls this queue and writes
    # the resulting bounce/complaint events into email_suppressions.
    SES_QUEUE_URL = module.ses_consumer.queue_url

    SCAN_PROVIDER  = var.scan_provider
    GEMINI_API_KEY = var.gemini_api_key
    GROQ_API_KEY   = var.groq_api_key

    # WC 2026 standings. 'mock' keeps the page on sample data; a real
    # football-data.org key flips it to live fixtures/results.
    WC_DATA_PROVIDER = "football-data"
    WC_API_KEY       = var.wc_api_key

    JOBS_MODE = "enabled"

    UPLOADS_DRIVER     = "s3"
    UPLOADS_BUCKET     = module.storage.uploads_bucket
    UPLOADS_REGION     = var.region
    UPLOADS_PUBLIC_URL = module.cdn.uploads_url
    AWS_REGION         = var.region
  }, var.scan_model != "" ? { SCAN_MODEL = var.scan_model } : {})
}

# ─── Compute (depends on every other module) ──────────────────────────────────

module "compute" {
  source         = "../../modules/compute"
  env            = local.env
  region         = var.region
  hostname       = local.hostname
  vpc_id         = module.networking.vpc_id
  alb_subnet_ids = module.networking.public_subnet_ids
  # With no NAT gateway (enable_nat_gateway = false above), the app instance
  # lives in the PUBLIC subnets so it can egress via the internet gateway.
  # The app security group still only accepts inbound from the ALB SG.
  app_subnet_ids     = module.networking.public_subnet_ids
  alb_sg_id          = module.networking.alb_sg_id
  app_sg_id          = module.networking.app_sg_id
  route53_zone_id    = module.dns.zone_id
  secret_arn         = module.secrets.secret_arn
  uploads_bucket     = module.storage.uploads_bucket
  uploads_bucket_arn = module.storage.uploads_bucket_arn
  user_pool_arn      = module.auth.user_pool_arn
  ecr_registry       = local.ecr_registry
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

  weekday_start_hour = 17 # Mon-Fri 5pm
  weekend_start_hour = 7  # Sat-Sun 7am
  stop_hour          = 23 # 11pm every day
}

# ─── Dev laptop access (IAM users + SSM/Secrets policy) ──────────────────────
# Lets a developer ssm:StartSession the app instance (for port-forwarding into
# the private RDS) and read the cromo/dev/app secret (to grab DATABASE_URL for
# psql). Access keys are NOT provisioned here — create them in the console for
# each user post-apply so the secret material stays out of Terraform state.

module "dev_access" {
  source            = "../../modules/dev-access"
  env               = local.env
  region            = var.region
  account_id        = local.account_id
  usernames         = var.developer_iam_users
  app_secret_arn    = module.secrets.secret_arn
  instance_name_tag = "cromo-${local.env}-app"
}

# ─── SES bounce/complaint consumer (SQS) ──────────────────────────────────────
# SNS topics live in env/shared. This per-env queue subscribes to both,
# survives backend restarts/deploys, and is read by the in-process poller
# in apps/backend/src/services/ses-poller.service.ts.

module "ses_consumer" {
  source              = "../../modules/ses-consumer"
  env                 = local.env
  bounce_topic_arn    = "arn:aws:sns:${var.region}:${local.account_id}:cromo-ses-bounces"
  complaint_topic_arn = "arn:aws:sns:${var.region}:${local.account_id}:cromo-ses-complaints"
  consumer_role_name  = module.compute.iam_role_name
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
