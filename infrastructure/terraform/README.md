# Terraform — Cromo Cloud Infrastructure

All AWS resources are provisioned with Terraform. Console clicks are forbidden — every resource lives in code so it can be reviewed, rolled back, and reproduced per environment.

## Layout

```
infrastructure/terraform/
  bootstrap/             # One-time, run first: S3 state bucket, DynamoDB lock, ECR repos
  modules/
    networking/          # VPC, subnets, security groups, NAT, IGW
    compute/             # EC2 + launch template + ALB + ACM wiring
    database/            # RDS PostgreSQL (db.t3.micro for dev)
    cache/               # ElastiCache Redis (cache.t3.micro for dev)
    storage/             # S3 buckets (uploads, backups)
    auth/                # Cognito user pool + app client
    monitoring/          # CloudWatch log groups + minimal alarms
    dns/                 # Route 53 hosted zone + ALB alias records
    ses/                 # SES domain identity + DKIM
    secrets/             # Secrets Manager entries
  env/
    dev/                 # Dev environment composition — wires modules together
    staging/             # (Phase B2)
    prod/                # (Phase B2/B3)
```

## Region

All resources live in **`ca-central-1`** (Montréal) for PIPEDA compliance. The Terraform provider defaults here — don't override unless you know why.

## State backend

Remote state is stored in an S3 bucket with a DynamoDB lock table. Both are provisioned by `bootstrap/` and referenced by every other configuration via `backend.tf`.

## First-time setup

```bash
# 1. Apply the bootstrap (creates state bucket, lock table, ECR repos).
cd infrastructure/terraform/bootstrap
terraform init
terraform apply

# 2. Apply the dev environment.
cd ../env/dev
terraform init
terraform apply
```

See `docs/runbooks/cloud-bootstrap.md` for the full step-by-step including DNS delegation, secret population, and the first image push.
