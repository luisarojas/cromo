# Cloud Bootstrap

How to take a fresh AWS account and turn it into a running Cromo `dev` environment. This is a one-time process per environment; ongoing deploys are handled by `.github/workflows/ci-cd.yml`.

> **Prerequisites already met:**
> - AWS account with MFA on the root user, region `ca-central-1` (Montréal)
> - Domain `cromotrade.ca` registered at Namecheap
> - AWS Budget alert at $75 USD/month
>
> If any of these are missing, see `docs/architecture/infrastructure.md` §19.2.1.

## 0. One-time IAM setup (do not run as root)

Create an IAM admin user (or an Identity Center user) with `AdministratorAccess` for the initial bootstrap. After bootstrap, scope it down. Configure the AWS CLI locally:

```bash
aws configure --profile cromo
# default region: ca-central-1
# output:         json

export AWS_PROFILE=cromo
export AWS_REGION=ca-central-1
```

## 1. Apply the bootstrap (state bucket, lock table, ECR repos, OIDC)

```bash
cd infrastructure/terraform/bootstrap
terraform init
terraform apply \
  -var "account_id=$(aws sts get-caller-identity --query Account --output text)"
```

Outputs to keep handy:
- `tfstate_bucket` — paste into every `env/*/backend.tf` (replace `REPLACE_WITH_ACCOUNT_ID`)
- `ecr_backend_url` / `ecr_frontend_url` — strip the trailing repo name; the registry-only host (e.g. `123456789012.dkr.ecr.ca-central-1.amazonaws.com`) goes into `ecr_registry` in `terraform.tfvars`

## 2. Apply the shared composition (hosted zone, SES identity)

```bash
cd ../env/shared
cp terraform.tfvars.example terraform.tfvars
# Fill in dmarc_report_email

terraform init
terraform apply
```

This composition owns the resources that outlive any specific env — the Route 53 hosted zone for `cromotrade.ca` and the SES domain identity + DKIM + SPF + DMARC records. Both dev and prod look them up by name / deterministic ARN, so `terraform destroy` on either env is safe with this in place.

Grab the nameservers immediately — propagation runs in parallel with the rest of the setup:

```bash
terraform output route53_nameservers
```

Log into Namecheap → `cromotrade.ca` → Domain → Nameservers → set to **Custom DNS** and paste all four. Propagation takes 10 minutes to a few hours. Verify with:

```bash
dig +short NS cromotrade.ca
```

Until propagation completes, ACM certificate validation in step 3 will be pending and the ALB listener won't be reachable on HTTPS.

## 3. Apply the dev environment

```bash
cd ../dev
cp terraform.tfvars.example terraform.tfvars
# Fill in account_id, ecr_registry, alert_email, jwt_secret (openssl rand -base64 32),
# github_repo, admin_emails, admin_temp_password

terraform init
terraform apply
```

This provisions: VPC, subnets, security groups, NAT, ALB + ACM cert, EC2 (in a 1-node ASG), RDS Postgres, ElastiCache Redis, S3 uploads bucket, Cognito user pool, Secrets Manager entry, CloudWatch log groups + SNS alarm topic, and the env-specific `dev.cromotrade.ca` alias record in the shared hosted zone.

> **Auth runs on Cognito here.** `dev` and `prod` set `AUTH_MODE=cognito`; the backend brokers `/api/v1/auth/*` to the pool (see `docs/architecture/auth-security.md` §9.3). Local Docker dev stays `AUTH_MODE=local`.

> **Bootstrapped admin.** Each address in `admin_emails` (e.g. `r.luisaf@gmail.com`) is created in the pool and added to the `admin` group, which maps to `role=admin`. `admin_temp_password` must satisfy the pool policy (12+ chars, upper, lower, number). After the environment is up, the admin sets a real password via the **Forgot password** flow on the login page — enter the email, then the 6-digit code Cognito emails, then a new password. This clears the temporary password and, on first login, JIT-creates the admin's DB row. There is no admin DB seed; the seed-based `admin@test.local` only exists in local mode.

> **Cost reality check.** A full dev environment running 24/7 costs roughly $55–60 USD/month (RDS $15, ElastiCache $12, EC2 $15, ALB $8, NAT $3, plus a few cents of CloudWatch/Secrets/S3). The business-hours schedule (`docs/architecture/infrastructure.md` §19.2.2) brings that to roughly $20–25/month by stopping the ASG and RDS instance overnight, every night. The $75 budget alert is sized to fit that scheduled-dev footprint plus prod.

## 4. Verify SES domain & request production access

```bash
aws ses get-identity-verification-attributes --identities cromotrade.ca
# expect VerificationStatus=Success once DNS propagates
```

SES starts in the **sandbox** — you can only send to verified addresses, and the daily quota is 200 messages. Prod can't sign up real users until you leave the sandbox. Plan for this **at least a week before prod launch** — AWS reviews the request manually and looks at your account's sending history before approving, so you need actual sends on the books first.

Because Cromo has no staging environment (see `infrastructure.md` §17.1), the only place to build that sending history is **dev**:

1. Verify your own email address in SES (`aws ses verify-email-identity --email-address you@example.com`).
2. From dev, trigger the real flows that send mail — sign up a test user (email verification flow), request a password reset, accept a trade with notifications enabled. A handful of these is enough to give AWS something to look at.
3. Open the SES console → Account dashboard → Request production access. In the request mention: CASL compliance, the consent-record flow in the database, and the bounce/complaint handler webhook (`/api/v1/webhooks/ses-bounce`).
4. AWS turnaround is typically <24h. If approval comes back conditional ("describe your unsubscribe flow"), respond promptly — the case stays open for 14 days.

Until production access is granted, prod cannot send to any address that isn't manually verified, so don't open prod sign-ups before this is approved.

## 5. First deploy — one-shot bootstrap script

The first deploy is a chicken-and-egg dance: EC2's user-data tries to pull from ECR, but no images exist yet; the compose file isn't in S3 yet; the catalog isn't seeded. `scripts/deploy-dev-bootstrap.sh` does the whole sequence in one command — build and push prod images, upload the compose file to S3, SSM the ASG instance into pulling and starting containers, seed the catalog from `cromo/dev/app` in Secrets Manager, smoke-test the public health endpoints.

```bash
./scripts/deploy-dev-bootstrap.sh
```

What it requires: `aws`, `docker` (with buildx), `jq`, `terraform`. Run from the repo root with `AWS_PROFILE` already exported.

What it does NOT do: trigger the GitHub Actions workflow. That's step 6 — once secrets are wired, every subsequent push to `main` redeploys automatically and you never need to run this script again.

> **The script is single-use.** Use it for the very first dev bring-up and any time you nuke + recreate the env. For everyday changes, push to `main` and let CI deploy.

> **If the ASG is paused.** The business-hours schedule scales the ASG to 0 outside Mon–Sun 10:00–22:00 ET. The script will fail at the "look up ASG instance" step in that case — either run during business hours, or temporarily set `desired_capacity = 1` via console / `aws autoscaling set-desired-capacity`.

## 6. Wire CI/CD

The OIDC provider and the per-env IAM role are both provisioned by Terraform — bootstrap creates the account-wide GitHub OIDC provider, and `modules/cicd/` creates the env-scoped role. Dev's role only trusts pushes to `main`; prod's only trusts `v*` tag pushes.

Collect the four GitHub secret values from Terraform outputs:

```bash
cd infrastructure/terraform/env/dev
terraform output github_actions_deploy_role_arn   # → AWS_DEPLOY_ROLE_ARN
terraform output uploads_bucket                   # → DEV_S3_BUCKET
# ECR_REGISTRY = first segment of `terraform output -raw ecr_backend_url`
# DEV_ASG_NAME = "cromo-dev-app" (hard-coded in env/dev/main.tf)
```

In GitHub repo settings → Secrets and variables → Actions, add:

| Secret              | Value |
|---------------------|-------|
| `AWS_DEPLOY_ROLE_ARN` | `github_actions_deploy_role_arn` output |
| `ECR_REGISTRY`        | `<account>.dkr.ecr.ca-central-1.amazonaws.com` |
| `DEV_ASG_NAME`        | `cromo-dev-app` |
| `DEV_S3_BUCKET`       | `uploads_bucket` output |

The first push to `main` after that triggers `.github/workflows/deploy-dev.yml`, which builds, pushes, and SSM-runs `docker compose pull && up -d` on the instance.

> **Trust-policy gotcha.** The role's trust is scoped via the OIDC `sub` claim to one repo and one ref pattern. If you fork the repo or rename it, update `github_repo` in `terraform.tfvars` and re-apply — otherwise STS will reject the assume call with `AccessDenied`.

## 7. Smoke test

```bash
curl -sf https://dev.cromotrade.ca/api/v1/health
# {"status":"ok"}

curl -sf https://dev.cromotrade.ca/api/v1/health/ready
# {"status":"ready","checks":{"database":"ok","redis":"ok"}}

curl -sI https://dev.cromotrade.ca/
# HTTP/2 200, served by the frontend container
```

If anything is red, the logs land in CloudWatch:
- `/cromo/dev/api`
- `/cromo/dev/frontend`

## 8. Standing up prod

Once dev is healthy and you're ready to provision production, prod uses the same modules with different inputs. The workflow is the same as §3–7, with these differences:

- **Shared comes first.** Both envs assume `env/shared` is already applied. If you got dev running, you already did this — no extra step. Prod can be applied without dev existing.
- **SES identity is shared.** Lives in `env/shared`; prod just references it by deterministic ARN. Don't add a duplicate SES module to prod.
- **Sandbox exit is a prerequisite, not a post-launch task.** Follow §4 to leave the SES sandbox *before* prod accepts sign-ups, otherwise verification emails won't reach real users.
- **terraform.tfvars values change.** Real `gemini_api_key` (not `mock`), on-call distribution for `alert_email`, fresh `jwt_secret`, plus `admin_emails` + a fresh `admin_temp_password` for the prod admin bootstrap. Copy `env/prod/terraform.tfvars.example` and treat it as a launch checklist.
- **Backend state is separate.** Replace `REPLACE_WITH_ACCOUNT_ID` in `env/prod/backend.tf` with your account ID, then `terraform init`.
- **Resources are destroy-protected.** Prod RDS, S3, Cognito, and ALB all have deletion protection on. A `terraform destroy` of the prod env will fail until you `terraform apply -var 'deletion_protection=false'` first — that's intentional friction.
- **No business-hours schedule.** The `scheduling` module is wired into `env/prod/main.tf` with `enable = false` so it renders no resources. Don't flip this to true unless you intend to take prod offline outside business hours (you don't).
- **CI deploy needs a second workflow.** `.github/workflows/deploy-dev.yml` only targets dev. Copy it to `deploy-prod.yml` and trigger on a tag push (`v*`) rather than every merge to main.
- **HA differences from dev.** Prod runs one NAT gateway per AZ (`single_nat_gateway = false`), a multi-AZ Redis replication group (`num_cache_clusters = 2`, `automatic_failover_enabled = true`), and a multi-AZ RDS instance. Dev runs single instances of all three to keep cost in the $20–25/mo range. The compute module puts the EC2 ASG in private subnets in both envs; only the ALB sits in public.

## 9. Tear-down and recreate

See **`docs/runbooks/cloud-recreate.md`** for the safe nuke + recreate flow. The short version: `terraform destroy` in `env/dev` (or `env/prod`) leaves the shared hosted zone, SES identity, ECR images, and state bucket intact — so the next `apply` doesn't require re-delegating DNS or re-verifying SES.

## 10. Applying a secret / env change to a running env

Changing a value the app reads from Secrets Manager (e.g. `AUTH_MODE`, `JWT_SECRET`, `GEMINI_API_KEY`) takes **two** independent things to go live, and getting only one of them is the usual cause of a post-change outage:

1. **A fresh `cromo.env`.** The env file at `/etc/cromo/cromo.env` is written **only** by the instance's boot user-data (`compute/main.tf`, `aws secretsmanager get-secret-value > /etc/cromo/cromo.env`). `terraform apply` updates the *secret*, but a running instance never re-reads it — you need a **new instance** for the change to reach the box.
2. **The app (re)started with a valid `IMAGE_TAG`.** The compose file resolves `${ECR_REGISTRY}/cromo-backend:${IMAGE_TAG}`, and those vars are injected by the **deploy path** (the CI workflow or `deploy-dev-bootstrap.sh`) via SSM — *not* by user-data. A cold-booted instance therefore has the right `cromo.env` but **no running containers** until a deploy lands on it.

> **Why an instance refresh alone breaks things.** `start-instance-refresh` gives you (1) — a new instance with the updated `cromo.env` — but terminates the old, working instance and leaves the new one with no app running, because nothing has supplied `IMAGE_TAG` yet. Result: ALB returns `502` (no healthy target). Symptom check: `docker ps -a` shows no `…api…` container and `docker compose logs` warns `IMAGE_TAG`/`ECR_REGISTRY` "variable is not set".

**Correct sequence for a secret/env change:**

```bash
# 1. Land the secret value
cd infrastructure/terraform/env/dev && terraform apply

# 2. Roll instances so they pick up the new cromo.env
aws autoscaling start-instance-refresh --auto-scaling-group-name cromo-dev-app

# 3. Deploy the app onto the (now cold) instance — this starts the containers
#    with the correct IMAGE_TAG. Either re-run CI, or:
./scripts/deploy-dev-bootstrap.sh
```

If you only changed code (no secret), skip steps 1–2 — a normal push-to-`main` CI deploy is enough, since `cromo.env` is unchanged.

**Recovering a 502 after a refresh** (cold instance, app never started): don't refresh again. Confirm the latest image is in ECR (the `deploy-dev` run for your commit is green), then run `./scripts/deploy-dev-bootstrap.sh` (or re-run the workflow) to deploy onto the current instance. Verify with `curl https://dev.cromotrade.ca/api/v1/health`.
