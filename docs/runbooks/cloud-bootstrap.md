# Cloud Bootstrap — Phase B1

How to take a fresh AWS account and turn it into a running Cromo `dev` environment. This is a one-time process per environment; ongoing deploys are handled by `.github/workflows/deploy-dev.yml`.

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

## 1. Apply the bootstrap (state bucket, lock table, ECR repos)

```bash
cd infrastructure/terraform/bootstrap
terraform init
terraform apply \
  -var "account_id=$(aws sts get-caller-identity --query Account --output text)"
```

Outputs to keep handy:
- `tfstate_bucket` — paste into `env/dev/backend.tf` (replace `REPLACE_WITH_ACCOUNT_ID`)
- `ecr_backend_url` / `ecr_frontend_url` — strip the trailing repo name; the registry-only host (e.g. `123456789012.dkr.ecr.ca-central-1.amazonaws.com`) goes into `ecr_registry` in `terraform.tfvars`

## 2. Apply the dev environment

```bash
cd ../env/dev
cp terraform.tfvars.example terraform.tfvars
# Fill in account_id, ecr_registry, alert_email, jwt_secret (openssl rand -base64 32)

terraform init
terraform apply
```

This provisions: VPC, subnets, security groups, NAT, ALB + ACM cert, EC2 (in a 1-node ASG), RDS Postgres, ElastiCache Redis, S3 uploads bucket, Cognito user pool, SES domain identity + DKIM, Secrets Manager entry, CloudWatch log groups + SNS alarm topic, and the Route 53 hosted zone for `cromotrade.ca`.

> **Cost reality check.** A full dev environment running 24/7 costs roughly $55–60 USD/month (RDS $15, ElastiCache $12, EC2 $15, ALB $8, NAT $3, plus a few cents of CloudWatch/Secrets/S3). The business-hours schedule (`docs/architecture/infrastructure.md` §19.2.2) brings that to roughly $20–25/month by stopping the ASG and RDS instance nights + weekends. The $75 budget alert is sized to fit that scheduled-dev footprint plus prod.

## 3. Delegate DNS at Namecheap

Terraform output `route53_nameservers` gives four hostnames like:

```
ns-1234.awsdns-12.org
ns-567.awsdns-34.com
ns-890.awsdns-56.net
ns-1111.awsdns-78.co.uk
```

Log into Namecheap → `cromotrade.ca` → Domain → Nameservers → set to **Custom DNS** and paste all four. Propagation takes 10 minutes to a few hours. Verify with:

```bash
dig +short NS cromotrade.ca
```

Until propagation completes, ACM certificate validation will be pending and the ALB listener won't be reachable on HTTPS.

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

## 5. Push the first images

Once `terraform apply` finishes, the EC2 user-data script has tried to pull `latest` from ECR — but no images exist yet. Push them once manually so the instance has something to run:

```bash
ECR_REGISTRY=$(terraform output -raw ecr_backend_url | cut -d/ -f1)
aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY"

# Build for amd64 even if you're on Apple Silicon.
docker buildx build --platform linux/amd64 \
  -f apps/backend/Dockerfile.prod \
  -t "$ECR_REGISTRY/cromo-backend:latest" --push .

docker buildx build --platform linux/amd64 \
  -f apps/frontend/Dockerfile.prod \
  --build-arg NEXT_PUBLIC_API_URL=https://dev.cromotrade.ca \
  --build-arg NEXT_PUBLIC_ENV=dev \
  -t "$ECR_REGISTRY/cromo-frontend:latest" --push .
```

Then upload the compose file and trigger the first deploy:

```bash
S3_BUCKET=$(terraform output -raw uploads_bucket)
aws s3 cp infrastructure/docker/docker-compose.prod.yml \
  "s3://$S3_BUCKET/_deploy/docker-compose.prod.yml"

# Use SSM to start the containers (no SSH).
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names cromo-dev-app \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" --output text)
aws ssm start-session --target "$INSTANCE_ID"
# Inside the session:
#   sudo su -
#   cd /opt/cromo
#   export ECR_REGISTRY=... IMAGE_TAG=latest CROMO_ENV=dev
#   aws s3 cp s3://"$S3_BUCKET"/_deploy/docker-compose.prod.yml docker-compose.yml
#   docker compose pull && docker compose up -d
#   exit
```

## 6. Run migrations and seed the catalog

The backend's `runMigrations()` runs at startup, so the schema is applied automatically the moment the API container boots. Seed the catalog from your laptop:

```bash
DATABASE_URL="$(terraform output -raw database_endpoint | sed 's/^/postgres:\/\/cromo_admin:PASSWORD@/')/cromo" \
  ./scripts/seed-database.sh --remote
```

The password lives in Secrets Manager — pull it with:

```bash
aws secretsmanager get-secret-value \
  --secret-id cromo/dev/app --query SecretString --output text \
  | jq -r '.DATABASE_URL'
```

## 7. Wire CI/CD

In GitHub repo settings → Secrets and variables → Actions, add:

| Secret              | Value |
|---------------------|-------|
| `AWS_DEPLOY_ROLE_ARN` | ARN of an IAM role with `AssumeRoleWithWebIdentity` trust on the GitHub OIDC provider, granted ECR push, S3 write to the deploy prefix, and `ssm:SendCommand` |
| `ECR_REGISTRY`        | `<account>.dkr.ecr.ca-central-1.amazonaws.com` |
| `DEV_ASG_NAME`        | `cromo-dev-app` |
| `DEV_S3_BUCKET`       | Terraform output `uploads_bucket` |

The first push to `main` after that triggers `.github/workflows/deploy-dev.yml`, which builds, pushes, and SSM-runs `docker compose pull && up -d` on the instance.

## 8. Smoke test

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

## 9. Standing up prod

Once dev is healthy and you're ready for Phase B3, prod uses the same modules with different inputs. The workflow is the same as §2–8, with these differences:

- **Run dev first.** Prod's DNS module is configured with `create_zone = false` — it looks up the existing `cromotrade.ca` hosted zone created by the dev `terraform apply`. Applying prod before dev will fail at the DNS lookup.
- **SES identity is shared.** SES domain identities are AWS-account-scoped, so dev already verified `cromotrade.ca`. Prod's `env/prod/main.tf` deliberately does NOT include the SES module — it just references the existing identity ARN. Don't add a duplicate SES module.
- **Sandbox exit is a prerequisite, not a post-launch task.** Follow §4 to leave the SES sandbox *before* prod accepts sign-ups, otherwise verification emails won't reach real users.
- **terraform.tfvars values change.** Real `groq_api_key` (not `mock`), on-call distribution for `alert_email`, fresh `jwt_secret`. Copy `env/prod/terraform.tfvars.example` and treat it as a launch checklist.
- **Backend state is separate.** Replace `REPLACE_WITH_ACCOUNT_ID` in `env/prod/backend.tf` with your account ID, then `terraform init`.
- **Resources are destroy-protected.** Prod RDS, S3, Cognito, and ALB all have deletion protection on. A `terraform destroy` of the prod env will fail until you `terraform apply -var 'deletion_protection=false'` first — that's intentional friction.
- **No business-hours schedule.** The `scheduling` module is wired into `env/prod/main.tf` with `enable = false` so it renders no resources. Don't flip this to true unless you intend to take prod offline outside business hours (you don't).
- **CI deploy needs a second workflow.** `.github/workflows/deploy-dev.yml` only targets dev. Copy it to `deploy-prod.yml` and trigger on a tag push (`v*`) rather than every merge to main.

Known prod-grade follow-ups documented inline in `env/prod/main.tf`:
1. Single NAT Gateway (acceptable for soft launch, fix before scale).
2. EC2 instances run in public subnets behind security groups (functional, but should be moved to private subnets for defence-in-depth).

Neither blocks launch, but both are worth tracking in your post-launch backlog.

## 10. Tear-down (when needed)

```bash
cd infrastructure/terraform/env/dev
terraform destroy
```

Order matters — destroy will fail if the RDS deletion-protection or S3 force-destroy variables are flipped on. For dev they default to `false`, so this should clean up in one shot. The bootstrap (state bucket + ECR repos) is preserved.
