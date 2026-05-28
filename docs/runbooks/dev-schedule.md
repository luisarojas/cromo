# Dev Environment Schedule

dev.cromotrade.ca runs on a daily schedule to avoid unnecessary AWS costs. The schedule controls two resources in lockstep:

- **EC2 (ASG)** — scaled to 1 during hours, 0 outside them
- **RDS** — started/stopped on the same cadence via EventBridge Scheduler

## Current schedule

**Mon–Sun, 07:00–23:00 ET** (`America/Toronto`)

## Where the schedule lives

```
infrastructure/terraform/env/dev/main.tf  →  module "scheduling" block
```

The module accepts these variables (defined in `modules/scheduling/variables.tf`):

| Variable | Current value | Meaning |
|---|---|---|
| `days` | `"MON-SUN"` | Day-of-week range for the schedule |
| `start_hour` | `7` | Hour to scale up (24h, local time) |
| `start_minute` | `0` | Minute offset for scale-up |
| `stop_hour` | `23` | Hour to scale down (24h, local time) |
| `stop_minute` | `0` | Minute offset for scale-down |
| `time_zone` | `"America/Toronto"` | IANA time zone for all expressions |

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

  days       = "MON-SUN"   # e.g. "MON-FRI" to exclude weekends
  start_hour = 7
  stop_hour  = 23
}
```

**2. Apply only the scheduling module:**

```bash
cd infrastructure/terraform/env/dev
terraform apply -target=module.scheduling
```

Terraform updates the ASG scheduled actions and EventBridge Scheduler schedules in place — no instance replacement, no downtime.

> **Note:** `terraform apply` does not immediately start or stop the environment. It only updates the future scheduled actions. Use the manual commands below to change the current state right away.

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

Then apply: `terraform apply -target=module.scheduling`
