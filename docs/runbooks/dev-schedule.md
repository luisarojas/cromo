# Dev Environment Schedule

dev.cromotrade.ca runs on a daily schedule to avoid unnecessary AWS costs. The schedule controls two resources in lockstep:

- **EC2 (ASG)** — scaled to 1 during hours, 0 outside them
- **RDS** — started/stopped on the same cadence via EventBridge Scheduler

## Current schedule

**Mon–Sun, 10:00–22:00 ET** (`America/Toronto`)

## Where the schedule lives

```
infrastructure/terraform/env/dev/main.tf  →  module "scheduling" block
```

The module accepts these variables (defined in `modules/scheduling/variables.tf`):

| Variable | Current value | Meaning |
|---|---|---|
| `weekday_start_hour` | `10` | Hour to scale up Mon–Fri (24h, local time) |
| `weekend_start_hour` | `10` | Hour to scale up Sat–Sun (24h, local time) |
| `start_minute` | `0` | Minute offset for scale-up |
| `stop_hour` | `22` | Hour to scale down, applied every day (24h, local time) |
| `stop_minute` | `0` | Minute offset for scale-down |
| `time_zone` | `"America/Toronto"` | IANA time zone for all expressions |

Scale-up is split into two scheduled actions (`MON-FRI` and `SAT-SUN`) so weekdays
and weekends can start at different hours. Set both to the same value for a
uniform every-day window, as we do now. **There is no `days` variable** — the day
grouping is fixed, and the way to exclude a day group is a different start hour,
not a day range. The nightly stop is uniform across all seven days by design.

## Changing the schedule

**1. Edit the module call in `infrastructure/terraform/env/dev/main.tf`:**

```hcl
module "scheduling" {
  source        = "../../modules/scheduling"
  env           = local.env
  enable        = true
  asg_name      = module.compute.asg_name
  db_identifier = module.database.identifier
  db_arn        = module.database.arn

  weekday_start_hour = 10
  weekend_start_hour = 10
  stop_hour          = 22
}
```

**2. Commit and push to `main`.**

Terraform runs through GitHub Actions OIDC (`.github/workflows/terraform.yml`), not from a laptop — a PR posts the plan as a comment, and a push to `main` auto-applies `dev`. Terraform updates the ASG scheduled actions and EventBridge Scheduler schedules in place — no instance replacement, no downtime.

Local `terraform apply` stays for genuine emergencies only (via the `cromo` profile + MFA); for routine schedule edits it bypasses plan review and the prod gate.

> **Note:** applying does not immediately start or stop the environment. It only updates the future scheduled actions — the new window takes effect at its next boundary. Use the manual commands below to change the current state right away.

## Manually scaling up (outside scheduled hours)

The deploy pipeline already handles this for deployments. For ad-hoc access outside hours:

```bash
# Find the ASG name
ASG=$(aws autoscaling describe-auto-scaling-groups \
  --region ca-central-1 \
  --query "AutoScalingGroups[?contains(Tags[?Key=='Env'].Value,'dev')].AutoScalingGroupName" \
  --output text)

# Scale the ASG up
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name "$ASG" \
  --min-size 1 --max-size 1 --desired-capacity 1 \
  --region ca-central-1

# Start RDS (takes ~2 min)
aws rds start-db-instance \
  --db-instance-identifier cromo-dev \
  --region ca-central-1
```

The next scheduled stop will scale everything back down automatically.

## Manually scaling down (before the scheduled stop)

```bash
# Find the ASG name
ASG=$(aws autoscaling describe-auto-scaling-groups \
  --region ca-central-1 \
  --query "AutoScalingGroups[?contains(Tags[?Key=='Env'].Value,'dev')].AutoScalingGroupName" \
  --output text)

# Scale the ASG down
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name "$ASG" \
  --min-size 0 --max-size 1 --desired-capacity 0 \
  --region ca-central-1

# Stop RDS
aws rds stop-db-instance \
  --db-instance-identifier cromo-dev \
  --region ca-central-1
```

## Disabling the schedule entirely

Set `enable = false` to remove all scheduled actions. The ASG and RDS will stay at whatever state they are currently and never be touched automatically.

```hcl
module "scheduling" {
  ...
  enable = false
}
```

Then commit and push to `main` — the same OIDC workflow applies it (see "Changing the schedule" above).

Note that disabling leaves the ASG and RDS wherever they happen to be. If the schedule is disabled while dev is scaled to 0, dev stays down until someone scales it up by hand.
