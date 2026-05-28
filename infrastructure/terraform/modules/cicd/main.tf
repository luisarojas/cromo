terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# Look up the bootstrap-managed OIDC provider and ECR repos by stable
# identifiers. Avoids passing ARNs through tfvars (which would couple every
# env to the bootstrap output) and keeps this module's API minimal.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_ecr_repository" "backend" { name = "cromo-backend" }
data "aws_ecr_repository" "frontend" { name = "cromo-frontend" }

locals {
  account   = data.aws_caller_identity.current.account_id
  partition = data.aws_partition.current.partition
  region    = data.aws_region.current.name
}

# ─── Trust policy ─────────────────────────────────────────────────────────────
# Restricts who can assume the role by combining audience + sub-claim checks.
# The sub claim encodes repo + ref, so dev can be limited to main-branch runs
# and prod to v* tag runs. Anything outside the patterns is rejected by STS.

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

resource "aws_iam_role" "deploy" {
  name                 = "cromo-${var.env}-gha-deploy"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

# ─── Permission policy ────────────────────────────────────────────────────────
# Exactly what .github/workflows/deploy-*.yml needs and nothing more:
#   1. Push to the two ECR repos
#   2. Upload the compose file to the env's uploads bucket under _deploy/
#   3. Describe the env's ASG to find the instance ID
#   4. Run an SSM shell command on instances tagged with the env's app name

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = [
      data.aws_ecr_repository.backend.arn,
      data.aws_ecr_repository.frontend.arn,
    ]
  }

  statement {
    sid       = "S3DeployUpload"
    actions   = ["s3:PutObject"]
    resources = ["${var.uploads_bucket_arn}/_deploy/*"]
  }

  statement {
    sid     = "AsgDescribe"
    actions = ["autoscaling:DescribeAutoScalingGroups"]
    # DescribeAutoScalingGroups is not resource-scopeable (AWS limitation).
    resources = ["*"]
  }

  statement {
    sid = "AsgScaleUp"
    actions = [
      "autoscaling:SetDesiredCapacity",
      "autoscaling:UpdateAutoScalingGroup",
    ]
    resources = [
      "arn:${local.partition}:autoscaling:${local.region}:${local.account}:autoScalingGroup:*:autoScalingGroupName/cromo-${var.env}-*",
    ]
  }

  # SSM SendCommand needs two resource statements: one for the document, one
  # for the instances. The instance statement is scoped by a tag condition
  # so the role can't accidentally run commands on unrelated EC2.
  statement {
    sid       = "SsmSendCommandDocument"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${local.partition}:ssm:${local.region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "SsmSendCommandInstances"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${local.partition}:ec2:${local.region}:${local.account}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Name"
      values   = ["cromo-${var.env}-app"]
    }
  }

  statement {
    sid = "SsmReadCommand"
    actions = [
      "ssm:DescribeInstanceInformation",
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "cromo-${var.env}-gha-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
