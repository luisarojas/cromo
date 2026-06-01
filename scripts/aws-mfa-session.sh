#!/usr/bin/env bash
# scripts/aws-mfa-session.sh
#
# Mint short-lived MFA-protected AWS credentials and print eval-able exports.
# Required because the IAM users in this account (cromo-admin, dev operators)
# are gated by an inline policy that denies every sensitive action unless
# aws:MultiFactorAuthPresent = true. A bare access key + secret signs requests
# without MFA, so every call fails until you go through STS GetSessionToken.
#
# USAGE
#   eval "$(./scripts/aws-mfa-session.sh)"                  # uses $AWS_PROFILE
#   eval "$(./scripts/aws-mfa-session.sh --profile cromo)"  # explicit profile
#   eval "$(./scripts/aws-mfa-session.sh --duration 14400)" # 4 hours (default 8h)
#
# REQUIREMENTS
#   - aws CLI v2 configured with the long-lived access key (e.g. `aws configure`).
#   - The IAM user must already have a virtual MFA device enabled. To bootstrap
#     a freshly-created user before MFA is set up, do it once in the AWS console
#     (IAM → users → <user> → Security credentials → Assign MFA device); CLI
#     bootstrap also works because iam:CreateVirtualMFADevice / EnableMFADevice
#     are in the policy's no-MFA-needed allow list.
#
# IMPLEMENTATION NOTES
#   - Reads the MFA device ARN via iam:ListMFADevices on the calling identity
#     (allowed without MFA by the policy). We pick the first device — solo dev
#     setup, no second-factor sharing.
#   - sts:GetSessionToken is in the same no-MFA-needed allow list; STS itself
#     enforces the --token-code check independently.

set -euo pipefail

PROFILE="${AWS_PROFILE:-default}"
DURATION=28800   # 8h, the max for an IAM user (vs 12h for an assumed role)

while [ $# -gt 0 ]; do
  case "$1" in
    --profile)  PROFILE="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0" >&2
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

# Re-shape to a clean environment for the discovery calls — we don't want any
# already-exported temp creds from a previous session leaking in.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

USER_NAME=$(aws --profile "$PROFILE" sts get-caller-identity --query Arn --output text | awk -F/ '{print $NF}')
MFA_ARN=$(aws --profile "$PROFILE" iam list-mfa-devices --user-name "$USER_NAME" \
  --query 'MFADevices[0].SerialNumber' --output text)

if [ -z "$MFA_ARN" ] || [ "$MFA_ARN" = "None" ]; then
  echo "no MFA device configured for IAM user '$USER_NAME' — set one up first" >&2
  exit 1
fi

# Prompt on stderr so `eval "$(...)"` still consumes stdout cleanly.
printf 'MFA code for %s: ' "$USER_NAME" >&2
read -r CODE

CREDS=$(aws --profile "$PROFILE" sts get-session-token \
  --serial-number "$MFA_ARN" \
  --token-code "$CODE" \
  --duration-seconds "$DURATION" \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken,Expiration]' \
  --output text)

read -r AK SK ST EXP <<<"$CREDS"

cat <<EOF
export AWS_ACCESS_KEY_ID=$AK
export AWS_SECRET_ACCESS_KEY=$SK
export AWS_SESSION_TOKEN=$ST
# Session expires: $EXP
EOF
