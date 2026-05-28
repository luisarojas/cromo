# Dev Environment Schedule

dev.cromotrade.ca runs only during business hours to avoid unnecessary AWS costs. The schedule controls two resources in lockstep:

- **EC2 (ASG)** — scaled to 1 during hours, 0 outside them
- **RDS** — started/stopped on the same cadence via EventBridge Scheduler

## Where the schedule lives

```
infrastructure/terraform/env/dev/main.tf  →  module "scheduling" block
```

The module accepts four time variables. Their defaults (defined in `modules/scheduling/variables.tf`) are:

| Variable | Default | Meaning |
|---|---|---|
| `start_hour` | `8` | Hour to scale up (24h, local time) |
| `start_minute` | `0` | Minute offset for scale-up |
| `stop_hour` | `19` | Hour to scale down (24h, local time) |
| `stop_minute` | `0` | Minute offset for scale-down |
| `time_zone` | `"America/Toronto"` | IANA time zone for all expressions |

All times are **Monday–Friday only**. A Saturday 00:00 safety net scales the ASG back to 0 in case something scaled it up manually on a Friday evening.

## Changing the hours

**1. Edit the module call in `infrastructure/terraform/env/dev/main.tf`:**

```hcl
module "scheduling" {
  source        = "../../modules/scheduling"
  env           = local.env
  enable        = true
  asg_name      = module.compute.asg_name
  db_identifier = module.database.identifier
  db_arn        = module.database.arn

  # Add or override any of these:
  time_zone    = "America/Toronto"
  start_hour   = 8
  start_minute = 0
  stop_hour    = 19
  stop_minute  = 0
}
```

**2. Apply only the scheduling module:**

```bash
cd infrastructure/terraform/env/dev
terraform apply -target=module.scheduling
```

Terraform will update the two ASG scheduled actions and the two EventBridge Scheduler schedules in place — no instance replacement, no downtime.

## Disabling the schedule entirely

Set `enable = false` to remove all scheduled actions. The ASG and RDS will stay at whatever capacity they're currently at and never be touched automatically.

```hcl
module "scheduling" {
  ...
  enable = false
}
```

Then apply: `terraform apply -target=module.scheduling`

To bring the environment back up manually after disabling:

```bash
# Scale the ASG up
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name cromo-dev-app \
  --min-size 1 --max-size 1 --desired-capacity 1

# Start the RDS instance (takes ~2 min)
aws rds start-db-instance --db-instance-identifier cromo-dev-db --region ca-central-1
```

## Manually overriding outside business hours

The deploy pipeline already handles the common case (push to main outside hours): it detects `desired_capacity=0` and scales the ASG up to 1 for the deploy, then leaves it for the next scheduled stop.

To access the site outside hours for ad-hoc testing without changing Terraform:

```bash
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name cromo-dev-app \
  --min-size 1 --max-size 1 --desired-capacity 1 \
  --region ca-central-1

aws rds start-db-instance \
  --db-instance-identifier cromo-dev-db \
  --region ca-central-1
```

The next scheduled stop event will scale everything back down automatically.
