terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# IAM role that GitHub Actions assumes (via OIDC) to run `terraform plan`
# and `terraform apply`. Separate from modules/cicd's deploy role because
# the responsibilities are different:
#
#   - cicd `deploy` role:    narrow permissions for "push image + restart
#                            ASG". Trust patterns vary per env (dev = main,
#                            prod = v-tags).
#   - terraform-runner role: broad permissions because Terraform needs to
#                            manage every resource. Trust patterns gated by
#                            GitHub Environment names so required-reviewer
#                            approval can be enforced in the GitHub UI.
#
# Why one role and not per-env: AWS account is single-account, the
# role is assumed by short-lived OIDC sessions, and the sub-claim
# pattern (`environment:tf-dev` vs `environment:tf-prod`) lets us
# discriminate without managing two role ARNs as repo secrets.
#
# Why not subject to the cromo-shared-require-mfa policy: that policy
# attaches to IAM users via aws_iam_user_policy_attachment, not roles.
# OIDC-assumed roles carry their own short-lived session — the MFA
# requirement only exists to harden long-lived access keys, which this
# role doesn't have.

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
  name                 = "cromo-tf-runner"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = var.max_session_duration_seconds
  description          = "GitHub Actions OIDC role for Terraform plan/apply."
}

# Terraform needs admin to manage every resource. The defence is in the
# trust policy (only OIDC tokens from specific repo + GitHub environments)
# and in the GitHub environment's required-reviewer protection rule (prod).
resource "aws_iam_role_policy_attachment" "admin" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
