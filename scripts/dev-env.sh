#!/bin/bash
# scripts/dev-env.sh
#
# Manually spin an environment (dev or prod) up or down, outside any
# business-hours schedule. Mirrors what the EventBridge / ASG schedules do
# automatically in dev:
#   up   → start RDS, scale the app ASG to 1, then block until the app's
#          /api/v1/health/ready endpoint responds (or UP_TIMEOUT_SECS elapses)
#   down → scale the app ASG to 0, stop RDS
# ALB and NAT stay up either way.
#
# The target environment is CROMO_ENV (default `dev`); it selects the ASG,
# RDS instance, and terraform dir by name (cromo-<env>-app / cromo-<env>-db).
#
# NOTE (dev): this is a manual override. The next scheduled action still
# fires — e.g. the daily 23:00 ET scale-down takes a manually-started dev
# env back down. See infrastructure/terraform/modules/scheduling/.
# NOTE (prod): scheduling is disabled in prod (env/prod → enable = false),
# so nothing auto-reverses a manual up/down. `down` is an OUTAGE — the
# ops GitHub workflow gates it behind a typed confirmation.
#
# Requires: aws CLI configured for the cromo profile (or ambient OIDC creds
# in CI).
# Usage (from anywhere):
#   ./scripts/dev-env.sh up|down|status              # dev (default)
#   CROMO_ENV=prod ./scripts/dev-env.sh up|down|status

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

AWS_REGION="${AWS_REGION:-ca-central-1}"

# Locally we default to the MFA-gated `cromo` profile. In CI (e.g. the
# ops GitHub Actions workflow) credentials arrive via OIDC as
# AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN in the environment — setting
# AWS_PROFILE there would point the CLI at a profile that doesn't exist on
# the runner and shadow those creds. So only default the profile when no
# ambient access key is present.
if [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
  export AWS_PROFILE="${AWS_PROFILE:-cromo}"
fi

# Target environment. Drives the resource names and the terraform dir.
CROMO_ENV="${CROMO_ENV:-dev}"
case "$CROMO_ENV" in
  dev|prod) ;;
  *) echo "✗ unknown CROMO_ENV '$CROMO_ENV' (expected 'dev' or 'prod')" >&2; exit 1 ;;
esac

ASG_NAME="cromo-${CROMO_ENV}-app"
DB_ID="cromo-${CROMO_ENV}-db"
ENV_DIR="$REPO_ROOT/infrastructure/terraform/env/${CROMO_ENV}"

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

# True when this env's app ASG exists — a cheap proxy for "the env's
# terraform stack has been applied". `describe-auto-scaling-groups` returns
# an empty list (exit 0) for an unknown name rather than erroring, so it's a
# clean existence probe; `db_status` below, by contrast, throws
# DBInstanceNotFound and would abort the script under `set -e`.
env_provisioned() {
  local count
  count=$(aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$ASG_NAME" --region "$AWS_REGION" \
    --query "length(AutoScalingGroups)" --output text)
  [ "$count" != "0" ]
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
    terraform -chdir="$ENV_DIR" output -raw hostname 2>/dev/null | sed 's|^https://||'
  fi
}

# mm:ss elapsed since the epoch timestamp passed as $1.
elapsed_since() {
  local secs=$(( $(date +%s) - $1 ))
  printf '%dm%02ds' $(( secs / 60 )) $(( secs % 60 ))
}

# Live-updating "still waiting" status line (overwrites itself via \r).
waiting_line() {
  printf '\r  …waiting (%s elapsed, timeout %dm)' \
    "$(elapsed_since "$1")" $(( UP_TIMEOUT_SECS / 60 ))
}

wait_for_up() {
  local started deadline host
  started=$(date +%s)
  deadline=$(( started + UP_TIMEOUT_SECS ))

  echo "▶ Waiting for RDS $DB_ID to become available"
  echo "+ polling: aws rds describe-db-instances --db-instance-identifier $DB_ID (DBInstanceStatus)"
  until [ "$(db_status)" = "available" ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      printf '\n'
      echo "✗ timed out waiting for RDS to become available ($(elapsed_since "$started"))" >&2
      exit 1
    fi
    waiting_line "$started"
    sleep 10
  done
  printf '\r\033[K'
  echo "  ✓ RDS available ($(elapsed_since "$started"))"

  echo "▶ Waiting for an in-service instance in $ASG_NAME"
  echo "+ polling: aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG_NAME (InService count)"
  until [ "$(asg_inservice_count)" != "0" ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      printf '\n'
      echo "✗ timed out waiting for an in-service ASG instance ($(elapsed_since "$started"))" >&2
      exit 1
    fi
    waiting_line "$started"
    sleep 10
  done
  printf '\r\033[K'
  echo "  ✓ instance in service ($(elapsed_since "$started"))"

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
      printf '\n'
      echo "✗ timed out waiting for the app to become ready at https://$host ($(elapsed_since "$started"))" >&2
      echo "  check CloudWatch /cromo/dev/api" >&2
      exit 1
    fi
    waiting_line "$started"
    sleep 10
  done
  printf '\r\033[K'
  echo "  ✓ app ready ($(elapsed_since "$started"))"
}

cmd_up() {
  echo "▶ Bringing $CROMO_ENV UP (region $AWS_REGION, profile ${AWS_PROFILE:-<ambient creds>})"

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
  echo "▶ Bringing $CROMO_ENV DOWN (region $AWS_REGION, profile ${AWS_PROFILE:-<ambient creds>})"

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

action="${1:-}"
case "$action" in
  up|down|status) ;;
  *)
    echo "Usage: $0 {up|down|status}   (env via CROMO_ENV, default 'dev')" >&2
    exit 1
    ;;
esac

# If the env's stack hasn't been applied yet (e.g. prod before env/prod
# exists), there's nothing to act on. Report it clearly and exit cleanly
# instead of letting an AWS "not found" abort the run — this is an expected
# state, not a failure, so the workflow stays green.
if ! env_provisioned; then
  echo "⚠ $CROMO_ENV is not provisioned yet — no ASG '$ASG_NAME' in $AWS_REGION."
  echo "  Apply infrastructure/terraform/env/$CROMO_ENV first; nothing to $action."
  exit 0
fi

case "$action" in
  up)     cmd_up ;;
  down)   cmd_down ;;
  status) cmd_status ;;
esac
