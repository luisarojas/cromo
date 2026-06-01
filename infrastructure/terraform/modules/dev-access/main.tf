terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# IAM users that operate the dev environment from a laptop. Each user is
# created without access keys; create those in the AWS console after apply so
# the secret material never lands in Terraform state.

resource "aws_iam_user" "dev" {
  for_each = toset(var.usernames)
  name     = each.value
  path     = "/cromo/dev/"
}

# Inline policy covering the operations the seed/ops runbook needs:
#  - ec2:DescribeInstances to locate the app instance by Name tag
#  - ssm:StartSession scoped to the app instance + the port-forward document
#  - ssm session management (describe, terminate, resume) for the caller's own
#    sessions
#  - secretsmanager:GetSecretValue on the cromo/${env}/app blob (so the runbook
#    can pull DATABASE_URL for psql)

data "aws_iam_policy_document" "dev" {
  statement {
    sid       = "FindInstance"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  # ssm:StartSession is authorised per-resource against BOTH the target
  # instance and the document. We tag-gate the instance but allow the
  # port-forward document unconditionally (documents have no tags to gate on).
  statement {
    sid       = "StartSessionOnAppInstance"
    actions   = ["ssm:StartSession"]
    resources = ["arn:aws:ec2:${var.region}:${var.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Name"
      values   = [var.instance_name_tag]
    }
  }

  statement {
    sid       = "StartSessionWithPortForwardDocument"
    actions   = ["ssm:StartSession"]
    resources = ["arn:aws:ssm:${var.region}::document/AWS-StartPortForwardingSessionToRemoteHost"]
  }

  statement {
    sid       = "ManageOwnSessions"
    actions   = ["ssm:DescribeSessions", "ssm:TerminateSession", "ssm:ResumeSession"]
    resources = ["arn:aws:ssm:${var.region}:${var.account_id}:session/$${aws:username}-*"]
  }

  statement {
    sid       = "ReadDevAppSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["${var.app_secret_arn}*"]
  }
}

resource "aws_iam_user_policy" "dev" {
  for_each = aws_iam_user.dev
  name     = "cromo-${var.env}-laptop"
  user     = each.value.name
  policy   = data.aws_iam_policy_document.dev.json
}

# Same MFA-enforcement contract as cromo-admin: deny everything sensitive
# unless the request was signed with MFA-protected credentials. Without this,
# a leaked access key for a dev user grants the (narrow) operational policy
# above with no MFA gate. With this, the user must `aws sts get-session-token`
# before the SSM / Secrets calls will succeed.

module "mfa" {
  source      = "../iam-mfa-enforcement"
  user_names  = [for u in aws_iam_user.dev : u.name]
  policy_name = "cromo-${var.env}-require-mfa"
}
