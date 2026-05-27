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
    scheduling/          # EventBridge + ASG schedules (dev business-hours shutoff)
    cicd/                # GitHub Actions deploy IAM role (per env)
  env/
    shared/              # Account-wide: Route 53 hosted zone + SES domain identity. Outlives any env.
    dev/                 # Dev environment — dev.cromotrade.ca, business-hours schedule, mock Groq
    prod/                # Prod environment — cromotrade.ca, multi-AZ RDS, deletion protection, real Groq
```

Compositions are deliberately decoupled: `shared/` owns the resources that survive an env nuke (hosted zone, SES identity), so `terraform destroy` on dev or prod is safe even when both exist. See `docs/runbooks/cloud-recreate.md` for the nuke + recreate flow.

## Region

All resources live in **`ca-central-1`** (Montréal) for PIPEDA compliance. The Terraform provider defaults here — don't override unless you know why.

## Environments

Cromo runs **dev + prod only** (decided 2026-05-25). Staging is intentionally deferred to control cost — see `docs/architecture/infrastructure.md` §17.1.

## State backend

Remote state is stored in S3 with DynamoDB locking. Both resources are provisioned by `bootstrap/` and referenced by every workspace via `backend.tf`.

| Setting | Value |
|---|---|
| Bucket | `cromo-tfstate-584133415742` |
| Region | `ca-central-1` |
| Locking | S3 native lockfile (`use_lockfile = true`) |
| Encryption | SSE enabled |

Each workspace has its own key within the same bucket:

| Workspace | Key |
|---|---|
| `env/shared` | `env/shared/terraform.tfstate` |
| `env/dev` | `env/dev/terraform.tfstate` |
| `env/prod` | `env/prod/terraform.tfstate` |

`bootstrap/` itself uses **local state** — it is the one workspace that cannot store its own state remotely, because it creates the bucket. Keep `bootstrap/terraform.tfstate` safe; losing it requires importing the bucket and table back by hand.

## First-time setup

```bash
# 1. Apply the bootstrap (creates state bucket, lock table, ECR repos, OIDC).
cd infrastructure/terraform/bootstrap
terraform init
terraform apply

# 2. Apply the shared composition (hosted zone, SES identity).
cd ../env/shared
terraform init
terraform apply

# 3. Apply the dev environment.
cd ../dev
terraform init
terraform apply
```

See `docs/runbooks/cloud-bootstrap.md` for the full step-by-step including DNS delegation, secret population, and the first image push.
