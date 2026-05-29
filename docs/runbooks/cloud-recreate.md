# Cloud Recreate — Nuke & Rebuild an Environment

How to destroy a Cromo environment (`dev` or `prod`) and stand it back up cleanly. This is rare — for everyday changes, push to `main` and let CI redeploy. Use this when you need a hard reset: schema corruption, drift you can't reason about, deliberate cost-saving teardown over a long break.

## Architecture recap

Cromo splits state across four Terraform compositions, each with its own S3 state key:

| State | Lifetime | What it owns |
|---|---|---|
| `bootstrap` | forever | Tfstate bucket, lock table, 2 ECR repos, GitHub OIDC provider |
| `env/shared` | forever | Route 53 hosted zone, SES domain identity + DKIM + SPF + DMARC |
| `env/dev` | replaceable | VPC, ALB, EC2, RDS, Redis, S3, Cognito, Secrets Manager, env DNS alias |
| `env/prod` | replaceable | Same as dev with prod sizing + deletion protection |

**Only `env/dev` and `env/prod` are safe to destroy.** Destroying `bootstrap` loses your image history and the lock for all other states. Destroying `env/shared` revokes DNS (Namecheap re-delegation required) and SES (sandbox-exit must be re-requested if prod was already out). Neither should happen except when shutting Cromo down completely.

## Safe dev nuke

Total clock time: ~30 minutes. About 2 minutes of typing; the rest is `terraform apply` waiting on RDS/EC2/ALB.

### 0. Prerequisites — dev `terraform.tfvars`

`env/dev` runs `AUTH_MODE=cognito`, so a clean apply must bootstrap the admin and (if you want live scanning) a real Groq key. Set these in the gitignored `infrastructure/terraform/env/dev/terraform.tfvars` **before** the re-apply (step 4):

```hcl
admin_emails        = ["r.luisaf@gmail.com"]   # created in the pool, added to the 'admin' group
admin_temp_password = "<12+ chars, upper/lower/number>"   # required when admin_emails is non-empty
groq_api_key        = "<real Groq key>"        # 'mock' skips live AI scanning
# plus the existing account_id, ecr_registry, alert_email, jwt_secret, github_repo
```

If `admin_emails` is empty there's no admin after recreate — the seed-based `admin@test.local` only exists in local mode, never in cloud.

### 1. Make sure you actually mean it

`terraform destroy` on `env/dev` deletes:
- Every Cognito user
- Every RDS row (users, accounts, collections, trades, messages — everything)
- Every S3 upload under `cromo-dev-uploads-<account>` (including avatars and scan images)
- CloudWatch log groups (`/cromo/dev/api`, `/cromo/dev/frontend`)
- Secrets Manager entry `cromo/dev/app`

Take a snapshot first if there's anything worth keeping:

```bash
DB_INSTANCE=$(cd infrastructure/terraform/env/dev && terraform output -raw database_endpoint | cut -d. -f1)
aws rds create-db-snapshot \
  --db-instance-identifier "$DB_INSTANCE" \
  --db-snapshot-identifier "cromo-dev-pre-nuke-$(date +%Y%m%d-%H%M)"
```

Snapshots live independently and survive `terraform destroy`.

### 2. Verify shared is healthy

`env/dev` looks up the hosted zone owned by `env/shared`. If shared has drifted or someone deleted records, the next apply will fail at the data source.

```bash
cd infrastructure/terraform/env/shared
terraform plan -detailed-exitcode  # exit 0 = no drift
```

If there's drift, sort that out *before* destroying dev — otherwise you'll be debugging two unrelated problems at once.

### 3. Destroy dev

```bash
cd ../dev
terraform destroy
```

If the ASG is at 0 from the business-hours schedule, that's fine. RDS deletion-protection is `false` in dev so the destroy proceeds without intervention. The `force_destroy = true` on the S3 bucket (dev only, gated by `deletion_protection = false`) empties it during destroy — anything in S3 is gone for good.

Expected clock time: 10–15 minutes (RDS deletion is the long pole).

### 4. Re-apply dev

```bash
terraform apply
```

ACM cert validation should be quick this time — the hosted zone is still live at Namecheap, so DNS resolution is instant. No re-delegation needed.

### 5. Re-run the bootstrap script

```bash
cd ../../..
./scripts/deploy-dev-bootstrap.sh
```

Builds and pushes fresh images (or reuses cached layers), uploads the compose file, SSMs the new instance into starting containers, re-seeds the catalog from `scripts/seeds/`, smoke-tests health.

> **If the ASG is at 0** (business-hours schedule keeps dev down outside Mon–Fri 5pm–11pm ET), the script fails at "look up ASG instance." Bring it up first: `aws autoscaling set-desired-capacity --auto-scaling-group-name cromo-dev-app --desired-capacity 1` (or the dev-env up toggle script).

> **Do NOT run an instance refresh as part of a recreate.** `terraform apply` already gives a fresh instance whose boot user-data writes `/etc/cromo/cromo.env` from the secret; this bootstrap script starts the app on it. A refresh would replace that instance with a cold one that has no containers running (cold instances can't self-start — they need `IMAGE_TAG` from the deploy path), leaving the ALB returning 502. See `cloud-bootstrap.md` §10.

### 6. Bootstrap the admin password & log in

The Cognito pool is fresh, so the admin from `admin_emails` starts in `FORCE_CHANGE_PASSWORD`. dev is in the SES sandbox, so the forgot-password email only reaches SES-verified addresses — set a permanent password directly instead:

```bash
POOL=$(cd infrastructure/terraform/env/dev && terraform output -raw cognito_user_pool_id)
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" \
  --username r.luisaf@gmail.com --password '<a real password>' --permanent

curl -s -X POST https://dev.cromotrade.ca/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"r.luisaf@gmail.com","password":"<the password>"}'
# → accessToken + role:admin. On a clean DB this JIT-creates the admin's users row (id = Cognito sub), no collision.
```

### 7. Confirm

```bash
curl -sf https://dev.cromotrade.ca/api/v1/health/ready
```

Done. The recreated env has a fresh DB (single `0000_baseline` migration + seeded catalog), the bootstrapped Cognito admin, and zero S3 uploads.

## What does NOT need redoing

- **DNS delegation at Namecheap** — the hosted zone in `env/shared` was never touched
- **SES verification** — same; identity is in `env/shared`
- **SES production access** — sandbox-exit approval is account-wide, persists
- **Bootstrap apply** — `env/dev` never depended on `bootstrap` for its lifecycle
- **GitHub secrets** — `AWS_DEPLOY_ROLE_ARN`, `ECR_REGISTRY`, `DEV_ASG_NAME`, `DEV_S3_BUCKET` all resolve to the same values (the IAM role is recreated with the same name; the ASG name is hard-coded; the S3 bucket name is deterministic)
- **ECR images** — images survive in the bootstrap-owned repos; the bootstrap script just pushes fresher ones

## Prod nuke — additional friction

Prod has the same model, but several toggles add steps:

1. **Deletion protection is on.** RDS, S3, Cognito, and ALB all block destroy until protection is removed:

   ```bash
   cd infrastructure/terraform/env/prod
   terraform apply \
     -var 'deletion_protection=false' \
     -target=module.database \
     -target=module.storage \
     -target=module.auth \
     -target=module.compute
   ```

   (Each target lets you flip the flag without re-rendering unrelated resources.)

2. **Multi-AZ RDS final snapshot.** RDS will demand a `final_snapshot_identifier` unless `skip_final_snapshot` is set. The module currently lets this default — verify behaviour before destroying.

3. **Multi-AZ Redis takes longer to delete** than dev's single node. Add ~10 min to the clock.

4. **Real users will notice.** Don't do this without an announcement.

## What to do if `env/shared` itself needs replacing

This is the nuclear option. Procedure exists but isn't routine:

1. Snapshot anything in DNS/SES you care about (`aws route53 list-resource-record-sets ...`).
2. `terraform destroy` on `env/shared`. This deletes the hosted zone, the SES identity, and all related records.
3. `terraform apply` on `env/shared`. Gets fresh nameservers — re-delegate at Namecheap and wait for propagation (10 min to a few hours).
4. SES identity is fresh — DKIM verification re-runs automatically; production-access status persists at the account level.
5. Both `env/dev` and `env/prod` need to be re-applied to refresh anything that cached the old zone ID at apply time. In practice this is a no-op apply for both — Terraform reads the zone ID via data source on every plan.

Why this is rare: the only good reason to destroy `env/shared` is moving to a different apex domain. If that happens, you're doing a brand-rename, which is bigger than this runbook.
