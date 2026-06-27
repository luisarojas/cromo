#!/usr/bin/env bash
# Render /etc/cromo/cromo.env from the environment's Secrets Manager secret.
#
# Run on the instance during a deploy (over SSM) so a secret/config change takes
# effect on the next redeploy WITHOUT replacing the instance. The EC2 user-data
# only renders this file at boot, and the rolling redeploy reuses it — so before
# this script existed, flipping a secret (e.g. WC_API_KEY) required terminating
# the instance. This mirrors the user-data render (modules/compute) exactly.
#
# Expects CROMO_ENV and AWS_REGION in the environment; runs as root (the SSM
# RunShellScript default), so it can write the root-owned env file.
set -euo pipefail
: "${CROMO_ENV:?CROMO_ENV is required}"
: "${AWS_REGION:?AWS_REGION is required}"

mkdir -p /etc/cromo
aws secretsmanager get-secret-value \
  --secret-id "cromo/${CROMO_ENV}/app" \
  --region "${AWS_REGION}" \
  --query SecretString \
  --output text \
  | jq -r 'to_entries | map("\(.key)=\(.value | @sh)") | .[]' \
  > /etc/cromo/cromo.env
chmod 600 /etc/cromo/cromo.env
echo "rendered /etc/cromo/cromo.env from cromo/${CROMO_ENV}/app"
