terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# Attaches an inline policy to each named IAM user that:
#   1) Allows the user to manage their own MFA device + access keys + password,
#      and to call sts:GetSessionToken (the bootstrap path: list/create/enable
#      MFA, then mint MFA-protected temp creds).
#   2) Denies every other API call unless the request was signed with
#      MFA-protected credentials (aws:MultiFactorAuthPresent = true).
#
# Effect: a leaked long-lived access key without an MFA code is useless for
# anything except managing the user's own MFA device. The user must run
# `aws sts get-session-token --serial-number <mfa-arn> --token-code <otp>`
# (or scripts/aws-mfa-session.sh) to obtain temp creds that pass the deny gate.
#
# The list of "no-MFA-needed" actions and the deny gate use the canonical
# pattern from the AWS docs tutorial "Allows MFA-authenticated IAM users to
# manage their own credentials" — kept verbatim so behaviour is predictable
# and matches AWS's documented examples.

data "aws_iam_policy_document" "mfa" {
  statement {
    sid       = "AllowViewAccountInfo"
    actions   = ["iam:GetAccountPasswordPolicy", "iam:GetAccountSummary", "iam:ListVirtualMFADevices"]
    resources = ["*"]
  }

  # NB on resource ARNs: dev users are created with an IAM path
  # (`modules/dev-access/main.tf` sets `path = "/cromo/dev/"`), so their ARN is
  # `arn:aws:iam::*:user/cromo/dev/<name>`, not `arn:aws:iam::*:user/<name>`.
  # `$${aws:username}` evaluates to the bare name with no path, so the literal
  # AWS-docs pattern `arn:aws:iam::*:user/$${aws:username}` silently denies every
  # per-user action for any path-having user. `*` matches `/` in IAM ARNs, so
  # `arn:aws:iam::*:user/*$${aws:username}` absorbs the path while still anchoring
  # on the username tail; it matches both path-less (`cromo-admin`) and
  # path-having (`/cromo/dev/luisa`) users without widening the blast radius.

  statement {
    sid       = "AllowManageOwnPasswords"
    actions   = ["iam:ChangePassword", "iam:GetUser"]
    resources = ["arn:aws:iam::*:user/*$${aws:username}"]
  }

  statement {
    sid = "AllowManageOwnAccessKeys"
    actions = [
      "iam:CreateAccessKey",
      "iam:DeleteAccessKey",
      "iam:ListAccessKeys",
      "iam:UpdateAccessKey",
      "iam:GetAccessKeyLastUsed",
    ]
    resources = ["arn:aws:iam::*:user/*$${aws:username}"]
  }

  statement {
    sid       = "AllowManageOwnVirtualMFADevice"
    actions   = ["iam:CreateVirtualMFADevice"]
    resources = ["arn:aws:iam::*:mfa/*"]
  }

  statement {
    sid = "AllowManageOwnUserMFA"
    actions = [
      "iam:DeactivateMFADevice",
      "iam:EnableMFADevice",
      "iam:ListMFADevices",
      "iam:ResyncMFADevice",
    ]
    resources = ["arn:aws:iam::*:user/*$${aws:username}"]
  }

  statement {
    sid    = "DenyAllExceptListedIfNoMFA"
    effect = "Deny"
    not_actions = [
      "iam:CreateVirtualMFADevice",
      "iam:EnableMFADevice",
      "iam:GetUser",
      "iam:ListMFADevices",
      "iam:ListVirtualMFADevices",
      "iam:ResyncMFADevice",
      "sts:GetSessionToken",
    ]
    resources = ["*"]
    # BoolIfExists (not Bool) is intentional — some service-to-service calls
    # don't populate aws:MultiFactorAuthPresent at all, and we want those to
    # be evaluated as "no MFA" rather than to silently bypass the deny.
    condition {
      test     = "BoolIfExists"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["false"]
    }
  }
}

# A customer-managed policy (6,144 B limit) rather than inline (2,048 B). The
# canonical AWS MFA-enforcement document is too large for inline once Terraform
# serialises it, and the managed-policy form is also semantically cleaner —
# one policy attached to many identities, not N copies.

resource "aws_iam_policy" "mfa" {
  name        = var.policy_name
  description = "Deny all sensitive API actions unless aws:MultiFactorAuthPresent = true; allow the user to manage their own MFA device + access keys + password."
  policy      = data.aws_iam_policy_document.mfa.json
}

resource "aws_iam_user_policy_attachment" "mfa" {
  for_each   = toset(var.user_names)
  user       = each.value
  policy_arn = aws_iam_policy.mfa.arn
}
