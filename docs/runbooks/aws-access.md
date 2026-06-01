# AWS Access (Cloud Ops)

How to authenticate to AWS for everyday work on Cromo — picking the right
profile, satisfying the MFA-required policy, and reaching the private dev
RDS to seed or query it.

> **Design rationale** for the two-profile split + MFA-required policy lives
> in [`docs/architecture/auth-security.md` §9.9](../architecture/auth-security.md#99-infrastructure-iam-aws-account-access).
> This runbook is the *how*; that section is the *why*.

## 1. The two profiles

There are two AWS CLI profiles, backing two different IAM users:

| Profile | IAM user | Permissions | Use for |
|---|---|---|---|
| **`cromo`** | `cromo-admin` | `AdministratorAccess` | Infrastructure changes: `terraform plan` / `apply` / `destroy` in `env/shared`, `env/dev`, `env/prod`; one-off console / CLI ops that need broad permissions. |
| **`cromo-dev`** | the dev operator user (e.g. `luisa`), created by `modules/dev-access` | `ec2:DescribeInstances`, `ssm:StartSession` to the `cromo-dev-app` instance, `secretsmanager:GetSecretValue` on `cromo/dev/app`, plus self-MFA management | Day-to-day dev ops: the seed runbook, SSM port-forward into RDS, reading secrets. |

**Mental model: `cromo-dev` is your default; `cromo` only comes out when you're changing infra.**
The admin key sits cold the rest of the time so a laptop compromise has a smaller blast radius.

The profile name `cromo` is **hardcoded** in `infrastructure/terraform/env/dev/backend.tf:7`
and `env/dev/main.tf:13`. `terraform` always uses `cromo`, regardless of
`$AWS_PROFILE`. You don't pick — Terraform does.

## 2. Why the MFA dance

Both IAM users carry the customer-managed policy `cromo-{shared,dev}-require-mfa`
(`infrastructure/terraform/modules/iam-mfa-enforcement/`). It implements the
canonical AWS pattern:

- **Allow** (no MFA needed): manage your own MFA device + access keys + password,
  and call `sts:GetSessionToken`.
- **Deny everything else** unless `aws:MultiFactorAuthPresent = true`.

Long-lived access keys signed without MFA are useless against this policy — every
real action is denied. You must first mint short-lived MFA-protected credentials
via `sts:GetSessionToken` and export those. The
[`scripts/aws-mfa-session.sh`](../../scripts/aws-mfa-session.sh) helper does the
dance for you.

The deny gate uses `BoolIfExists`, not `Bool` — service-to-service calls that
don't populate the context key are evaluated as "no MFA" rather than silently
bypassing the deny.

## 3. First-time setup for a new IAM user

When `modules/dev-access` provisions a new operator user, the user has no access
key and no MFA device. Bootstrap:

1. **Create an access key** — Console → IAM → Users → *user* → Security
   credentials → Create access key → CLI. Save the secret immediately; you can
   never view it again.

2. **Configure the CLI profile**:

   ```bash
   aws configure --profile cromo-dev
   # AWS Access Key ID:     <paste>
   # AWS Secret Access Key: <paste>
   # Default region:        ca-central-1
   # Default output format: json
   ```

3. **Enable a virtual MFA device** — Console → IAM → Users → *user* → Security
   credentials → Assign MFA device. Scan the QR with Authy / 1Password /
   Google Authenticator, enter two consecutive codes. (CLI bootstrap also works
   because `iam:CreateVirtualMFADevice` / `iam:EnableMFADevice` are in the
   policy's no-MFA-needed allow list — but the console flow is faster.)

4. **Mint MFA-protected creds** for the current shell:

   ```bash
   eval "$(./scripts/aws-mfa-session.sh --profile cromo-dev)"
   ```

5. **Verify**: `aws sts get-caller-identity` returns the user's ARN. Every
   subsequent CLI call in this shell uses the MFA-protected temp creds.

The same five steps apply to `cromo-admin` if you ever need to rotate or
re-bootstrap it.

## 4. Daily-driver flow

Open shell → mint creds once → work for 8 hours:

```bash
# Day-to-day ops
eval "$(./scripts/aws-mfa-session.sh --profile cromo-dev)"

# Terraform (different shell, or re-eval with --profile cromo)
eval "$(./scripts/aws-mfa-session.sh --profile cromo)"
```

The helper exports `AWS_ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` / `SESSION_TOKEN`
into your current shell. Those env vars take precedence over `--profile` for
any subsequent CLI calls, so you don't need to keep passing `--profile`.

Override the default 8 h session: `--duration 14400` for 4 h, etc. The max
for an IAM user (vs an assumed role) is 8 h.

## 5. Tunneling into the dev RDS

Dev RDS is `publicly_accessible = false`
(`infrastructure/terraform/modules/database/main.tf:34`). It's only reachable
from inside the VPC. To run `psql` or the seed script from your laptop, port-forward
through the dev EC2 app instance via SSM Session Manager.

**Prereqs**: AWS CLI v2, the `session-manager-plugin` (macOS:
`brew install --cask session-manager-plugin`), `jq`, and the `cromo-dev` profile
with MFA temp creds exported (`§4`).

```bash
# 1. Find the dev API instance ID.
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=cromo-dev-app" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

# 2. Pull the DATABASE_URL out of the dev secrets blob.
DATABASE_URL=$(aws secretsmanager get-secret-value \
  --secret-id cromo/dev/app --query SecretString --output text \
  | jq -r .DATABASE_URL)

# 3. Open the SSM port-forward. Leave this running in its own terminal.
aws ssm start-session --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters host=<RDS_ENDPOINT>,portNumber=5432,localPortNumber=15432
# RDS_ENDPOINT comes from `terraform -chdir=infrastructure/terraform/env/dev
# output -raw database_endpoint` (without port)

# 4. In another terminal: rewrite the host to localhost:15432 and connect.
LOCAL_URL=$(echo "$DATABASE_URL" | sed 's#@[^/]*/#@localhost:15432/#')
DATABASE_URL="$LOCAL_URL" psql                              # ad-hoc psql
# or:
DATABASE_URL="$LOCAL_URL" ./scripts/seed-database.sh --remote
```

## 6. Reseeding databases

Both `pnpm db:seed` (local) and the `--remote` runner above are
**idempotent**. Every sticker / variant / team / coca-cola / extra seed uses
`INSERT … ON CONFLICT DO UPDATE` so re-running overwrites the existing rows
with the current SQL values. No `db:reset` needed unless you want a clean
wipe.

**Local:**

```bash
pnpm db:seed
docker compose -f infrastructure/docker/docker-compose.yml exec cache redis-cli FLUSHALL
```

**Dev (through the tunnel from §5):**

```bash
# 1. Seed the database (laptop, via the port-forward).
DATABASE_URL="$LOCAL_URL" ./scripts/seed-database.sh --remote

# 2. Flush dev Redis. Redis is AWS ElastiCache in cloud (modules/cache),
#    NOT a docker container — `docker compose exec cache` only works locally.
#    Open an interactive SSM shell to the app instance and run redis-cli from
#    a throwaway redis image:
aws ssm start-session --target "$INSTANCE_ID"
#   inside the SSM shell:
#     REDIS_URL=$(sudo grep ^REDIS_URL= /etc/cromo/cromo.env | cut -d= -f2- | tr -d "'\"")
#     sudo docker run --rm --network host redis:7 redis-cli -u "$REDIS_URL" FLUSHALL
```

Why those flags on the `docker run`:
- `sudo grep` because `/etc/cromo/cromo.env` is `chmod 600` root-owned (set by user-data) and the SSM session lands you as `ssm-user`.
- `--network host` so the ephemeral container can reach the private ElastiCache endpoint over the EC2's VPC connectivity — on the default bridge network it can't resolve the private hostname.
- `redis-cli -u redis://…` consumes the full connection string from the secret without us having to split host/port apart.

**Why the Redis flush?** The backend caches the sticker list response for 1 h
and the catalog-version probe for 5 min (`apps/backend/src/services/stickers.service.ts:119,225`).
A reseed bumps `MAX(updated_at)` in the catalog tables, which the version probe
will pick up at its next miss — but that's up to 5 min of latency. `FLUSHALL`
makes the change visible immediately. The localStorage cache on each browser is
keyed by the version probe response, so it self-invalidates on the next page
load with no per-client action.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `psql: ... connection to server on socket "/tmp/.s.PGSQL.5432" failed` | `DATABASE_URL` isn't a valid `postgres://` URL, libpq fell back to local socket | Use the full URL form, not `host:port` |
| `An error occurred (AccessDeniedException) ... aws:MultiFactorAuthPresent = false` | Long-lived key is signed without MFA temp creds | `eval "$(./scripts/aws-mfa-session.sh --profile …)"` first |
| `SessionManagerPlugin is not found` | Plugin missing on laptop | `brew install --cask session-manager-plugin` |
| Connection refused on `localhost:15432` | SSM port-forward isn't actually running, or its session expired | Restart the `aws ssm start-session` command in §5 step 3 |
| `LimitExceeded: Maximum policy size of 2048 bytes` when applying Terraform | Hit the inline-policy cap on a `aws_iam_user_policy` | Convert to a customer-managed policy + `aws_iam_user_policy_attachment` (this is exactly the pattern in `modules/iam-mfa-enforcement`) |
| Every plan keeps "fixing" `aws_cognito_user.admin.attributes` | AWS-provider read/write asymmetry on custom Cognito schema attributes named `username` | The bootstrap admin no longer sets `custom:username`; the backend's `deriveUsername()` synthesises it from email on first login. If drift returns, check `modules/auth/main.tf` hasn't been re-edited to set it |
