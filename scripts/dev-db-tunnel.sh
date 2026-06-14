#!/usr/bin/env bash
# scripts/dev-db-tunnel.sh
#
# One-shot dev-RDS access from your laptop. Resolves the dev EC2 instance,
# pulls DATABASE_URL out of Secrets Manager, opens an SSM port-forward to the
# private RDS, and drops into psql with DATABASE_URL rewritten to localhost.
# The tunnel is torn down on exit.
#
# USAGE
#   ./scripts/dev-db-tunnel.sh                 # tunnel + psql (default)
#   ./scripts/dev-db-tunnel.sh --tunnel-only   # tunnel only; print LOCAL_URL, wait
#   ./scripts/dev-db-tunnel.sh -- pg_dump ...  # run any command with DATABASE_URL set
#
# REQUIREMENTS
#   - MFA-protected creds exported in this shell:
#       eval "$(./scripts/aws-mfa-session.sh --profile cromo-dev)"
#   - session-manager-plugin (brew install --cask session-manager-plugin)
#   - jq, psql, nc

set -euo pipefail

LOCAL_PORT=15432
INSTANCE_TAG="cromo-dev-app"
SECRET_ID="cromo/dev/app"

MODE="psql"
EXTRA_CMD=()
while [ $# -gt 0 ]; do
  case "$1" in
    --tunnel-only) MODE="tunnel"; shift ;;
    --)            shift; MODE="cmd"; EXTRA_CMD=("$@"); break ;;
    -h|--help)     sed -n '2,20p' "$0" >&2; exit 0 ;;
    *)             echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "${AWS_SESSION_TOKEN:-}" ]; then
  echo "no AWS session token in env — run:" >&2
  echo "  eval \"\$(./scripts/aws-mfa-session.sh --profile cromo-dev)\"" >&2
  exit 1
fi

echo "▶ Resolving dev instance..." >&2
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$INSTANCE_TAG" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "no running '$INSTANCE_TAG' instance — is dev up? (docs/runbooks/dev-schedule.md)" >&2
  exit 1
fi

echo "▶ Fetching DATABASE_URL from $SECRET_ID..." >&2
DATABASE_URL=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" --query SecretString --output text | jq -r .DATABASE_URL)

# Parse hostname out of postgres://user:pass@HOST:PORT/db — SSM port-forward
# wants the host alone, and DATABASE_URL is the only place it lives that
# doesn't need terraform state access or rds:Describe permissions.
RDS_HOST=$(echo "$DATABASE_URL" | sed -E 's#^[^@]+@([^:/]+).*#\1#')
LOCAL_URL=$(echo "$DATABASE_URL" | sed "s#@[^/]*/#@localhost:$LOCAL_PORT/#")

echo "▶ Opening tunnel: localhost:$LOCAL_PORT → $RDS_HOST:5432 (via $INSTANCE_ID)" >&2
TUNNEL_LOG=$(mktemp)
aws ssm start-session --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_HOST,portNumber=5432,localPortNumber=$LOCAL_PORT" \
  >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill $TUNNEL_PID 2>/dev/null || true; rm -f "$TUNNEL_LOG"' EXIT

for _ in $(seq 1 30); do
  if nc -z localhost "$LOCAL_PORT" 2>/dev/null; then break; fi
  if ! kill -0 $TUNNEL_PID 2>/dev/null; then
    echo "tunnel exited unexpectedly:" >&2
    cat "$TUNNEL_LOG" >&2
    exit 1
  fi
  sleep 0.5
done

if ! nc -z localhost "$LOCAL_PORT" 2>/dev/null; then
  echo "tunnel did not come up within 15s:" >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

echo "✓ Tunnel ready" >&2

case "$MODE" in
  tunnel)
    echo "  DATABASE_URL=$LOCAL_URL" >&2
    echo "  Ctrl-C to close." >&2
    wait $TUNNEL_PID
    ;;
  cmd)
    DATABASE_URL="$LOCAL_URL" "${EXTRA_CMD[@]}"
    ;;
  psql)
    psql "$LOCAL_URL"
    ;;
esac
