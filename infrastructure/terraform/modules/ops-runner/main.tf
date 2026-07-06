terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# IAM role that GitHub Actions assumes (via OIDC) to run
# `scripts/dev-env.sh {up,down,status}` from the ops workflow — the CI
# equivalent of the manual laptop override. Instantiated once per
# environment (dev, prod); var.env selects the role name + target resources.
#
# Separate from cromo-tf-runner on purpose. That role carries
# AdministratorAccess because Terraform must manage every resource; this
# one only needs to start/stop this env's RDS instance and scale its app
# ASG. Least privilege: a workflow bug (or a leaked OIDC token, which is
# already short-lived and repo-gated) can flip the env up/down but can't
# touch anything else in the account.
#
# Not subject to cromo-shared-require-mfa: that policy attaches to IAM
# users, not roles. OIDC sessions are short-lived and constrained by the
# trust policy's repo + GitHub-environment sub pattern.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  db_instance_identifier = coalesce(var.db_instance_identifier, "cromo-${var.env}-db")
  asg_name               = coalesce(var.asg_name, "cromo-${var.env}-app")
}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = var.github_sub_patterns
    }
  }
}

resource "aws_iam_role" "this" {
  name                 = "cromo-ops-${var.env}-runner"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = var.max_session_duration_seconds
  description          = "GitHub Actions OIDC role for scripts/dev-env.sh (start/stop ${var.env} env)."
}

# The five actions scripts/dev-env.sh calls, nothing more. Describe* on RDS
# and Auto Scaling don't support resource-level permissions, so they're a
# separate `*` statement; the state-changing actions are scoped to this
# env's specific DB instance and ASG.
data "aws_iam_policy_document" "permissions" {
  # Read-only status/polling. These APIs don't accept a resource ARN.
  statement {
    sid = "DescribeState"
    actions = [
      "rds:DescribeDBInstances",
      "autoscaling:DescribeAutoScalingGroups",
    ]
    resources = ["*"]
  }

  # Start/stop this env's database.
  statement {
    sid = "StartStopDatabase"
    actions = [
      "rds:StartDBInstance",
      "rds:StopDBInstance",
    ]
    resources = [
      "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${local.db_instance_identifier}",
    ]
  }

  # Scale the app ASG (0 for down, 1 for up). The ASG ARN embeds a
  # generated group-id segment, so it's wildcarded; the group NAME suffix
  # is the real constraint.
  statement {
    sid       = "ScaleAppAsg"
    actions   = ["autoscaling:UpdateAutoScalingGroup"]
    resources = ["arn:aws:autoscaling:*:${data.aws_caller_identity.current.account_id}:autoScalingGroup:*:autoScalingGroupName/${local.asg_name}"]
  }
}

resource "aws_iam_role_policy" "permissions" {
  name   = "env-control"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.permissions.json
}
