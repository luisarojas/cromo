# Cloud Bootstrap — Phase B1

How to take a fresh AWS account and turn it into a running Cromo `dev` environment. This is a one-time process per environment; ongoing deploys are handled by `.github/workflows/deploy-dev.yml`.

> **Prerequisites already met:**
> - AWS account with MFA on the root user, region `ca-central-1` (Montréal)
> - Domain `cromotrade.ca` registered at Namecheap
> - AWS Budget alert at $50 USD/month
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

> **Cost reality check.** A full dev environment running 24/7 costs roughly $40–50 USD/month (RDS $15, ElastiCache $12, EC2 $15, ALB $8, NAT $3, plus a few cents of CloudWatch/Secrets/S3). The $50 budget alert will fire within the first month. Either raise the budget or schedule the ASG/RDS down outside business hours.

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

SES starts in the **sandbox** — you can only send to verified addresses. To leave the sandbox:

1. Send a test email to a verified address (e.g. your own) and confirm it lands.
2. Open the SES console → Account dashboard → Request production access. Mention CASL compliance, the consent-record flow in the database, and the bounce/complaint handler.

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

## 9. Tear-down (when needed)

```bash
cd infrastructure/terraform/env/dev
terraform destroy
```

Order matters — destroy will fail if the RDS deletion-protection or S3 force-destroy variables are flipped on. For dev they default to `false`, so this should clean up in one shot. The bootstrap (state bucket + ECR repos) is preserved.
