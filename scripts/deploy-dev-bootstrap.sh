#!/bin/bash
# scripts/deploy-dev-bootstrap.sh
#
# One-shot first-deploy: builds + pushes the prod images, uploads the compose
# file to S3, kicks the ASG instance into pulling and starting containers,
# then seeds the catalog. Use ONLY for the very first dev deploy — every
# subsequent push to main is handled by .github/workflows/deploy-dev.yml.
#
# Requires:
#   - AWS CLI configured (export AWS_PROFILE=cromo before running)
#   - Docker with buildx (Apple Silicon is fine — we cross-build to linux/amd64)
#   - jq
#   - infrastructure/terraform/bootstrap and env/dev already applied
#
# Run from the repo root: ./scripts/deploy-dev-bootstrap.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

AWS_REGION="${AWS_REGION:-ca-central-1}"
DEV_DIR="infrastructure/terraform/env/dev"
BOOTSTRAP_DIR="infrastructure/terraform/bootstrap"

# ─── Preflight ────────────────────────────────────────────────────────────────

for cmd in aws docker jq terraform; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "✗ missing required command: $cmd" >&2
    exit 1
  fi
done

echo "▶ Reading Terraform outputs"
ECR_REGISTRY=$(terraform -chdir="$BOOTSTRAP_DIR" output -raw ecr_backend_url | cut -d/ -f1)
S3_BUCKET=$(terraform -chdir="$DEV_DIR" output -raw uploads_bucket)
ASG_NAME="cromo-dev-app"
HOSTNAME=$(terraform -chdir="$DEV_DIR" output -raw hostname | sed 's|^https://||')

echo "  ECR_REGISTRY = $ECR_REGISTRY"
echo "  S3_BUCKET    = $S3_BUCKET"
echo "  ASG_NAME     = $ASG_NAME"
echo "  HOSTNAME     = $HOSTNAME"

# ─── Build & push images ──────────────────────────────────────────────────────

echo "▶ Logging into ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

# Pin all three tags so the deploy workflow's :dev-latest reference and
# user-data's :latest fallback both resolve to the same image.
IMAGE_TAG="${IMAGE_TAG:-bootstrap-$(date -u +%Y%m%d%H%M%S)}"
echo "▶ Building & pushing backend (tag: $IMAGE_TAG)"
docker buildx build --platform linux/amd64 \
  -f apps/backend/Dockerfile.cloud \
  -t "$ECR_REGISTRY/cromo-backend:$IMAGE_TAG" \
  -t "$ECR_REGISTRY/cromo-backend:dev-latest" \
  -t "$ECR_REGISTRY/cromo-backend:latest" \
  --push .

echo "▶ Building & pushing frontend (tag: $IMAGE_TAG)"
docker buildx build --platform linux/amd64 \
  -f apps/frontend/Dockerfile.cloud \
  --build-arg "NEXT_PUBLIC_API_URL=https://$HOSTNAME" \
  --build-arg NEXT_PUBLIC_ENV=dev \
  -t "$ECR_REGISTRY/cromo-frontend:$IMAGE_TAG" \
  -t "$ECR_REGISTRY/cromo-frontend:dev-latest" \
  -t "$ECR_REGISTRY/cromo-frontend:latest" \
  --push .

# ─── Upload compose file + seed assets ───────────────────────────────────────

echo "▶ Uploading docker-compose.prod.yml to s3://$S3_BUCKET/_deploy/"
aws s3 cp infrastructure/docker/docker-compose.prod.yml \
  "s3://$S3_BUCKET/_deploy/docker-compose.prod.yml"

echo "▶ Uploading seed SQL files to s3://$S3_BUCKET/_deploy/seeds/"
aws s3 sync scripts/seeds/ "s3://$S3_BUCKET/_deploy/seeds/" --exclude "*.md"

# Generate a seed runner that executes on the EC2 instance (inside the VPC).
# psql is provided by a temporary postgres Docker container — no need to install
# it on the host. sslmode=require is appended because RDS rejects plain connections.
SEED_RUNNER=$(mktemp)
cat > "$SEED_RUNNER" << SCRIPT
#!/bin/bash
set -euo pipefail
mkdir -p /opt/cromo/seeds
aws s3 sync "s3://$S3_BUCKET/_deploy/seeds/" /opt/cromo/seeds/
RAW_URL=\$(aws secretsmanager get-secret-value \\
  --secret-id cromo/dev/app --region $AWS_REGION \\
  --query SecretString --output text | jq -r .DATABASE_URL)
DB_URL="\${RAW_URL}?sslmode=require"
for f in 00_album_catalog 01_teams 02_intro_stickers 03_team_stickers \\
         05_variants 06_feature_flags 08_coca_cola_stickers \\
         10_extra_stickers 13_team_album_pages 14_sticker_album_pages; do
  echo "  seeding \${f}.sql"
  docker run --rm -v /opt/cromo/seeds:/seeds postgres:16-alpine \\
    psql "\$DB_URL" -f "/seeds/\${f}.sql"
done
echo "Seeding complete."
SCRIPT
aws s3 cp "$SEED_RUNNER" "s3://$S3_BUCKET/_deploy/seed-catalog.sh"
rm "$SEED_RUNNER"

# ─── SSM run-command on the ASG instance ──────────────────────────────────────

echo "▶ Looking up ASG instance"
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)
if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "✗ no instance in ASG $ASG_NAME — is the ASG paused by the business-hours schedule?" >&2
  exit 1
fi
echo "  INSTANCE_ID  = $INSTANCE_ID"

echo "▶ Sending SSM start command"
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "deploy-dev-bootstrap $IMAGE_TAG" \
  --parameters "commands=[
    \"set -euxo pipefail\",
    \"export ECR_REGISTRY=$ECR_REGISTRY\",
    \"export IMAGE_TAG=$IMAGE_TAG\",
    \"export CROMO_ENV=dev\",
    \"mkdir -p /opt/cromo\",
    \"cd /opt/cromo\",
    \"aws s3 cp s3://$S3_BUCKET/_deploy/docker-compose.prod.yml docker-compose.yml\",
    \"aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY\",
    \"docker compose pull\",
    \"docker compose up -d\"
  ]" \
  --query "Command.CommandId" \
  --output text)

echo "  COMMAND_ID   = $COMMAND_ID"
echo "▶ Waiting for SSM command to finish (pulling images may take several minutes)"
aws ssm wait command-executed \
  --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --cli-read-timeout 600
STATUS=$(aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query "Status" --output text)
if [ "$STATUS" != "Success" ]; then
  echo "✗ SSM command status: $STATUS" >&2
  aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query "StandardErrorContent" --output text >&2
  exit 1
fi
echo "✓ Containers started"

# ─── Seed catalog via SSM ─────────────────────────────────────────────────────
# RDS is on a private subnet — psql must run from the EC2 instance inside the VPC.

echo "▶ Seeding catalog (running on EC2 via SSM)"
SEED_COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "seed-catalog $IMAGE_TAG" \
  --parameters "commands=[
    \"aws s3 cp s3://$S3_BUCKET/_deploy/seed-catalog.sh /opt/cromo/seed-catalog.sh\",
    \"chmod +x /opt/cromo/seed-catalog.sh\",
    \"/opt/cromo/seed-catalog.sh\"
  ]" \
  --query "Command.CommandId" \
  --output text)

echo "  SEED_COMMAND_ID = $SEED_COMMAND_ID"
echo "▶ Waiting for seed command to finish (may take a few minutes)"
aws ssm wait command-executed --command-id "$SEED_COMMAND_ID" --instance-id "$INSTANCE_ID"
SEED_STATUS=$(aws ssm get-command-invocation \
  --command-id "$SEED_COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query "Status" --output text)
if [ "$SEED_STATUS" != "Success" ]; then
  echo "✗ seed command status: $SEED_STATUS" >&2
  aws ssm get-command-invocation \
    --command-id "$SEED_COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query "StandardErrorContent" --output text >&2
  exit 1
fi
echo "✓ Catalog seeded"

# ─── Smoke test ───────────────────────────────────────────────────────────────

echo "▶ Smoke test"
sleep 10  # give the API container a moment to settle after first migration
if curl -sf "https://$HOSTNAME/api/v1/health" >/dev/null; then
  echo "✓ https://$HOSTNAME/api/v1/health OK"
else
  echo "⚠ /api/v1/health failed — check CloudWatch /cromo/dev/api" >&2
fi
if curl -sf "https://$HOSTNAME/api/v1/health/ready" >/dev/null; then
  echo "✓ https://$HOSTNAME/api/v1/health/ready OK"
else
  echo "⚠ /api/v1/health/ready failed — check DB + Redis connectivity from the EC2 instance" >&2
fi

echo
echo "✓ Bootstrap complete. From now on, push to main → deploy-dev.yml takes over."
