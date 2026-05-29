#!/bin/bash
# scripts/dev-env.sh
#
# Manually spin the dev environment up or down, outside the business-hours
# schedule. Mirrors what the EventBridge / ASG schedules do automatically:
#   up   → start RDS, scale the app ASG to 1, then block until the app's
#          /api/v1/health/ready endpoint responds (or UP_TIMEOUT_SECS elapses)
#   down → scale the app ASG to 0, stop RDS
# ALB and NAT stay up either way.
#
# NOTE: this is a manual override. The next scheduled action still fires —
# e.g. the daily 23:00 ET scale-down will take a manually-started env back
# down. See infrastructure/terraform/modules/scheduling/.
#
# Requires: aws CLI configured for the cromo profile.
# Usage (from anywhere):
#   ./scripts/dev-env.sh up
#   ./scripts/dev-env.sh down
#   ./scripts/dev-env.sh status

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

AWS_REGION="${AWS_REGION:-ca-central-1}"
export AWS_PROFILE="${AWS_PROFILE:-cromo}"

ASG_NAME="cromo-dev-app"
DB_ID="cromo-dev-db"
DEV_DIR="$REPO_ROOT/infrastructure/terraform/env/dev"

# Max seconds to wait for the env to come fully up (RDS + instance + app).
UP_TIMEOUT_SECS="${UP_TIMEOUT_SECS:-900}"

if ! command -v aws >/dev/null 2>&1; then
  echo "✗ missing required command: aws" >&2
  exit 1
fi

# Echo a command before running it, so the caller can see exactly what runs.
run() {
  echo "+ $*"
  "$@"
}

db_status() {
  aws rds describe-db-instances \
    --db-instance-identifier "$DB_ID" --region "$AWS_REGION" \
    --query "DBInstances[0].DBInstanceStatus" --output text
}

asg_desired() {
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$ASG_NAME" --region "$AWS_REGION" \
    --query "AutoScalingGroups[0].DesiredCapacity" --output text
}

scale_asg() {
  local n="$1"
  run aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --min-size "$n" --max-size "$n" --desired-capacity "$n" \
    --region "$AWS_REGION"
}

asg_inservice_count() {
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$ASG_NAME" --region "$AWS_REGION" \
    --query "length(AutoScalingGroups[0].Instances[?LifecycleState=='InService'])" \
    --output text
}

# App hostname, used for the final HTTP readiness probe. Prefer the Terraform
# output (canonical), fall back to APP_HOST env, else empty (probe skipped).
app_host() {
  if [ -n "${APP_HOST:-}" ]; then
    echo "$APP_HOST"
    return
  fi
  if command -v terraform >/dev/null 2>&1; then
    terraform -chdir="$DEV_DIR" output -raw hostname 2>/dev/null | sed 's|^https://||'
  fi
}

wait_for_up() {
  local deadline host
  deadline=$(( $(date +%s) + UP_TIMEOUT_SECS ))

  echo "▶ Waiting for RDS $DB_ID to become available"
  run aws rds wait db-instance-available \
    --db-instance-identifier "$DB_ID" --region "$AWS_REGION"
  echo "  ✓ RDS available"

  echo "▶ Waiting for an in-service instance in $ASG_NAME"
  echo "+ polling: aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG_NAME (InService count)"
  until [ "$(asg_inservice_count)" != "0" ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "✗ timed out waiting for an in-service ASG instance" >&2
      exit 1
    fi
    sleep 10
  done
  echo "  ✓ instance in service"

  host="$(app_host)"
  if [ -z "$host" ]; then
    echo "⚠ could not resolve app hostname (no APP_HOST and no terraform output);"
    echo "  skipping HTTP readiness probe. The instance is up but the app may"
    echo "  still be pulling images." >&2
    return
  fi

  echo "▶ Waiting for https://$host/api/v1/health/ready"
  echo "+ polling: curl -sf https://$host/api/v1/health/ready"
  until curl -sf "https://$host/api/v1/health/ready" >/dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "✗ timed out waiting for the app to become ready at https://$host" >&2
      echo "  check CloudWatch /cromo/dev/api" >&2
      exit 1
    fi
    sleep 10
  done
  echo "  ✓ app ready"
}

cmd_up() {
  echo "▶ Bringing dev UP (region $AWS_REGION, profile $AWS_PROFILE)"

  local status
  status="$(db_status)"
  case "$status" in
    stopped)
      echo "  starting RDS $DB_ID"
      run aws rds start-db-instance --db-instance-identifier "$DB_ID" \
        --region "$AWS_REGION" >/dev/null
      ;;
    available|starting|configuring-enhanced-monitoring|backing-up)
      echo "  RDS already $status — skipping start"
      ;;
    *)
      echo "  RDS is '$status' — not startable right now, skipping" >&2
      ;;
  esac

  echo "  scaling ASG $ASG_NAME to 1"
  scale_asg 1

  wait_for_up

  echo "✓ Dev is up and running."
}

cmd_down() {
  echo "▶ Bringing dev DOWN (region $AWS_REGION, profile $AWS_PROFILE)"

  echo "  scaling ASG $ASG_NAME to 0"
  scale_asg 0

  local status
  status="$(db_status)"
  case "$status" in
    available)
      echo "  stopping RDS $DB_ID"
      run aws rds stop-db-instance --db-instance-identifier "$DB_ID" \
        --region "$AWS_REGION" >/dev/null
      ;;
    stopped|stopping)
      echo "  RDS already $status — skipping stop"
      ;;
    *)
      echo "  RDS is '$status' — not stoppable right now, skipping" >&2
      ;;
  esac

  echo "✓ Spin-down requested."
}

cmd_status() {
  echo "ASG $ASG_NAME desired capacity: $(asg_desired)"
  echo "RDS $DB_ID status:             $(db_status)"
}

case "${1:-}" in
  up)     cmd_up ;;
  down)   cmd_down ;;
  status) cmd_status ;;
  *)
    echo "Usage: $0 {up|down|status}" >&2
    exit 1
    ;;
esac
