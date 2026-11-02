# Redeploy From Backup

Cromo's AWS infrastructure was fully deprovisioned on **2026-11-01**. This runbook rebuilds it and restores the `dev` data captured that day. Step detail that hasn't changed lives in [`cloud-bootstrap.md`](./cloud-bootstrap.md) and [`aws-access.md`](./aws-access.md); this file covers the order, what's different, and the restore.

Local Docker development doesn't depend on any of this. To load the backup locally, jump to [Restoring into local Docker](#restoring-into-local-docker).

## Current state

```mermaid
flowchart LR
  BOOT["<b>bootstrap/</b><br/>state bucket · ECR · GitHub OIDC"] --> SHARED
  SHARED["<b>env/shared/</b><br/>Route 53 zone · SES · CI roles"] --> DEV
  NC["Namecheap NS delegation"] --> DEV
  DEV["<b>env/dev/</b><br/>VPC · ALB · EC2 · RDS · Redis · S3 · CloudFront · Cognito"] --> APP
  APP["App deploy<br/>deploy-dev-bootstrap.sh"] --> DATA["Data restore<br/>backups/2026-11-01"]
```

Every box above is gone (`env/prod` was never deployed) and must be rebuilt left to right. What remains:

| Thing | State |
| --- | --- |
| AWS account `584133415742` | Open and empty. No IAM users (`cromo-admin` deleted), no budget. Reuse it. |
| GitHub | Workflows **disabled**. Repo secrets and variables kept. |
| `cromotrade.ca` | Registered at Namecheap with **auto-renew off**, and still pointing at the deleted Route 53 nameservers. |
| Config (git-ignored) | `infrastructure/terraform/env/{shared,dev}/terraform.tfvars`, `.env.local` (the real Gemini, Groq and football-data keys). |
| Backup (git-ignored) | `backups/2026-11-01/`, with a copy in cloud storage. |

## The backup

| File | Contents |
| --- | --- |
| `cromo-dev.dump` | `pg_dump -Fc --no-owner` of the dev `cromo` database (`public` + `drizzle` schemas, 26 applied migrations, 11 users: 4 Cognito-linked plus 7 local-mode seed fixtures). Made with `pg_dump` 18.6 against Postgres 16. |
| `cognito-users.json` | `list-users` of the old pool: old Cognito `sub` ↔ email for the 4 users. Drives the ID remap in §6.4. |
| `s3-uploads/` | Only `_deploy/` artifacts; no user uploads ever existed. Not needed, because the deploy script regenerates them. |

Intentionally not backed up: the `cromo/dev/app` secret (Terraform regenerates its values, and you supply the rest via tfvars; `JWT_SECRET` only signs short-lived tokens, so use a fresh one), Cognito passwords (AWS can't export them), and Redis (cache only).

## Prerequisites

- **Admin IAM user with MFA**, configured as the `cromo` CLI profile (`cloud-bootstrap.md` §0, `aws-access.md` §3). Recreate the cost budget too.
- **Tools:** `terraform` ≥ 1.7, `aws` CLI v2, `session-manager-plugin`, `docker` with buildx, `jq`, `nc`, and **`pg_restore` ≥ 18**. The dump's archive format (1.16) can't be read by older versions.
- **Domain:** check its expiry in Namecheap → Domain List and renew if needed. If the Private Email subscription has lapsed, set `enable_namecheap_mail = false` in the shared tfvars and in the `ENABLE_NAMECHEAP_MAIL` GitHub variable.
- **Delete the stale bootstrap state** so the apply starts clean: `rm infrastructure/terraform/bootstrap/terraform.tfstate*`.

**Using a new AWS account instead?** Replace `584133415742` everywhere `git grep -n 584133415742` finds it (the three `env/*/backend.tf` state-bucket names), plus `account_id` and `ecr_registry` in `env/dev/terraform.tfvars`, and the `ECR_REGISTRY` / `DEV_S3_BUCKET` GitHub variables. Every resource name is otherwise derived from the account ID, so nothing else changes.

## 1. Infrastructure

The first bring-up runs from the laptop: the CI role (`cromo-tf-runner`) lives in `env/shared`, so it can't run until shared exists.

```bash
eval "$(./scripts/aws-mfa-session.sh --profile cromo)"
export AWS_REGION=ca-central-1

cd infrastructure/terraform/bootstrap
terraform init && terraform apply -var "account_id=$(aws sts get-caller-identity --query Account --output text)"

cd ../env/shared
terraform init && terraform apply
terraform output route53_nameservers        # → §2

cd ../dev
terraform init && terraform apply           # ~15 min; ACM validation waits for §2
```

`env/dev` recreates the `luisa` operator user without credentials. Add a key and an MFA device in the console if you want the `cromo-dev` profile back.

## 2. DNS

The new hosted zone has new nameservers. In Namecheap → `cromotrade.ca` → **Manage** → **Nameservers** → **Custom DNS**, paste the four values and save. Check with `dig +short NS cromotrade.ca` (propagation takes 10 minutes to a few hours). You can do this while `env/dev` is applying.

SES DKIM re-verifies on its own once DNS resolves. The account starts in the **SES sandbox**, so mail only reaches verified addresses (`cloud-bootstrap.md` §4).

## 3. GitHub

Repo → **Settings → Secrets and variables → Actions**. The secrets and variables survived. In the same account the role ARNs are deterministic, so just confirm these against the Terraform outputs:

| Secret | Source |
| --- | --- |
| `AWS_TF_RUNNER_ROLE_ARN`, `AWS_OPS_DEV_ROLE_ARN`, `AWS_OPS_PROD_ROLE_ARN` | `env/shared` outputs `tf_runner_role_arn`, `ops_dev_role_arn`, `ops_prod_role_arn` |
| `AWS_DEPLOY_ROLE_ARN` | `env/dev` output `github_actions_deploy_role_arn` |

**The remaining secrets and variables must equal your local tfvars.** `terraform.yml` builds `TF_VAR_*` from them, so a mismatch makes the first CI apply silently rewrite the stack (for example, rotating `JWT_SECRET` or swapping API keys). The GitHub Environments `tf-shared` and `tf-dev` must exist.

Leave the workflows disabled until §7.

## 4. First app deploy

```bash
cd "$(git rev-parse --show-toplevel)"
./scripts/deploy-dev-bootstrap.sh
```

This builds and pushes the images, starts the containers, runs migrations and seeds the catalog (`cloud-bootstrap.md` §5). Dev is now live with an empty database.

## 5. Why the restore isn't just `pg_restore`

1. **Migrations.** The code may have migrations newer than the dump's 26. If you restore over a database the new code already migrated, `drizzle.__drizzle_migrations` will claim those migrations never ran while their tables exist, and the next boot fails with `already exists`. So **wipe both schemas, restore, then let the API apply the newer migrations on start.**
2. **Identity.** `users.id` *is* the Cognito `sub` (`ensureUser` in `services/user-provisioning.ts`). A new pool issues new subs, so a restored user's first login would try to insert a second row for the same email and fail on the unique constraint. **Recreate the users in the new pool, then rewrite `users.id` from old sub to new.** All 25 foreign keys to `users(id)` are `ON UPDATE CASCADE`, so one `UPDATE` per user carries their albums, collection, trades and messages with it.

```mermaid
sequenceDiagram
  autonumber
  actor Op as Operator
  participant EC2 as EC2 (SSM)
  participant RDS as RDS
  participant COG as New Cognito pool
  Op->>EC2: stop api
  Op->>RDS: drop schemas · pg_restore dump
  Note over RDS: users.id = OLD subs
  Op->>COG: admin-create-user ×4
  COG-->>Op: NEW subs
  Op->>RDS: UPDATE users SET id = new WHERE id = old
  Op->>EC2: start api → newer migrations + catalog reseed
  Op->>EC2: FLUSHALL Redis
  Op->>COG: set passwords
```

## 6. Restore

Run these from the repo root, in the MFA shell from §1. `scripts/dev-db-tunnel.sh -- <cmd>` runs `<cmd>` with `DATABASE_URL` pointing through an SSM tunnel to RDS.

### 6.1 Stop the API

```bash
B=backups/2026-11-01
IID=$(aws ec2 describe-instances \
  --filters Name=tag:Name,Values=cromo-dev-app Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
aws ssm send-command --instance-ids "$IID" --document-name AWS-RunShellScript \
  --parameters 'commands=["cd /opt/cromo && docker compose stop api"]'
```

### 6.2 Wipe and restore

```bash
./scripts/dev-db-tunnel.sh -- sh -c '
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" &&
  pg_restore --no-owner --no-privileges -d "$DATABASE_URL" backups/2026-11-01/cromo-dev.dump'
```

Expect exactly one error: `unrecognized configuration parameter "transaction_timeout"`. It comes from the `pg_dump` 18 header, which Postgres 16 doesn't recognise, and is harmless. Any other error is real.

### 6.3 Recreate the Cognito users

Terraform already created the `admin_emails` user and its `admin` group membership, so that one call fails with `UsernameExistsException`, which is fine.

```bash
POOL=$(terraform -chdir=infrastructure/terraform/env/dev output -raw cognito_user_pool_id)
for email in $(jq -r '.Users[].Attributes[] | select(.Name=="email") | .Value' "$B/cognito-users.json"); do
  aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$email" \
    --user-attributes Name=email,Value="$email" Name=email_verified,Value=true \
    --message-action SUPPRESS >/dev/null && echo "created $email"
done
```

`SUPPRESS` skips the invite email, which the SES sandbox would bounce. Admin rights come from the Cognito `admin` group, not the database. Re-add any other admins with `admin-add-user-to-group … --group-name admin`.

### 6.4 Remap user IDs

With `username_attributes = ["email"]`, each pool user's `Username` is its `sub`. Join the old and new pools on email:

```bash
aws cognito-idp list-users --user-pool-id "$POOL" > "$B/cognito-users.new.json"
jq -rn --slurpfile old "$B/cognito-users.json" --slurpfile new "$B/cognito-users.new.json" '
  def bymail(p): p.Users | map({ key: (.Attributes[] | select(.Name=="email") | .Value | ascii_downcase),
                                  value: .Username }) | from_entries;
  bymail($old[0]) as $o | bymail($new[0]) as $n |
  "BEGIN;",
  ($o | to_entries[] | select($n[.key] != null)
      | "UPDATE users SET id = '\''\($n[.key])'\'' WHERE id = '\''\(.value)'\''; -- \(.key)"),
  "COMMIT;"' > "$B/remap.sql"
cat "$B/remap.sql"     # 4 UPDATEs
./scripts/dev-db-tunnel.sh -- sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/2026-11-01/remap.sql'
```

Each statement should report `UPDATE 1`. The 7 seed-fixture users have no Cognito identity and stay as they are.

### 6.5 Start the API, flush Redis, set passwords

```bash
aws ssm send-command --instance-ids "$IID" --document-name AWS-RunShellScript \
  --parameters 'commands=["cd /opt/cromo && docker compose up -d api"]'
rm "$B/cognito-users.new.json" "$B/remap.sql"
```

- Flush Redis with the SSM-shell recipe in `aws-access.md` §6.
- Passwords: `aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username <email> --password '<pw>' --permanent` for each user, shared out of band. In the SES sandbox the alternative is to verify each address first (`aws sesv2 create-email-identity`) and have the user run **Forgot password**.

## 7. Verify and hand back to CI

```bash
curl -sf https://dev.cromotrade.ca/api/v1/health/ready
curl -s -X POST https://dev.cromotrade.ca/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"r.luisaf@gmail.com","password":"<pw>"}' | jq '.user | {id, username, role}'
# id = new sub · username = pre-teardown username · role = admin
```

Log in through the UI and check that a restored user's collection and trades are there. Then re-enable **CI + Deploy**, **Terraform** and **Ops — start/stop environment** (repo → Actions → workflow → **Enable workflow**). From here on, changes go through CI as usual.

## Restoring into local Docker

Local mode has no Cognito, so skip §6.3–6.4. The seed fixtures can log in locally; the 4 Cognito-linked users can't. The `postgres:16` container's `pg_restore` can't read the archive, so restore from the host against the published port:

```bash
LOCAL_URL=postgres://cromo:localpassword@localhost:5432/cromo_dev
COMPOSE="docker compose -f infrastructure/docker/docker-compose.yml"
$COMPOSE stop api
psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore --no-owner --no-privileges -d "$LOCAL_URL" backups/2026-11-01/cromo-dev.dump
$COMPOSE start api && $COMPOSE exec cache redis-cli FLUSHALL
```

This replaces the local database that integration tests share. Run `pnpm db:seed` before running the tests.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `terraform init` → `NoSuchBucket` | Bootstrap isn't applied yet, or `backend.tf` still names another account's bucket. |
| ACM cert stuck in `PENDING_VALIDATION` | Namecheap still points at the old nameservers (§2). |
| `pg_restore: unsupported version (1.16) in file header` | `pg_restore` is older than 18; use the host's. |
| `pg_restore` hangs | The API is still running and holding locks (§6.1). |
| API boot fails with `relation … already exists` | Schemas weren't wiped before the restore. Redo §6.1–6.2. |
| Login fails with a duplicate key on `users_email_unique` | That user wasn't remapped. Re-run §6.4. |
| Restored user lost admin | Add them to the Cognito `admin` group (§6.3). |
