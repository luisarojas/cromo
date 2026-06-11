terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# SES bounce/complaint events are produced by SES (configuration set →
# event destinations → SNS topics in env/shared) and consumed here.
#
# Why SQS instead of an HTTPS subscription:
#   - No SubscriptionConfirmation handshake. The HTTPS path required the
#     backend to be live with the new route deployed before `terraform
#     apply` could finish — a chicken-and-egg that broke every fresh
#     environment bring-up.
#   - Bounce events queue safely if the backend is down (rolling deploy,
#     scale-to-zero overnight on dev). With HTTPS, SNS retries for a
#     while and then gives up. With SQS, the queue holds messages for 14
#     days by default.
#   - No per-message signature verification — the queue is the authz
#     boundary. The IAM grant + queue policy do what the SNS signature
#     check did in the webhook.
#
# Topology:
#   SES configuration set
#     → SNS topic (bounces)       ─┐
#     → SNS topic (complaints)    ─┴→ this SQS queue → backend poller

resource "aws_sqs_queue" "ses_events" {
  name                       = "cromo-${var.env}-ses-events"
  message_retention_seconds  = 1209600 # 14 days, the max
  visibility_timeout_seconds = 60      # poller must DeleteMessage within 60s
  receive_wait_time_seconds  = 20      # long-poll, cheaper than tight loop

  # Dead-letter after 5 receive attempts. Anything that fails this many
  # times is a code bug, not a transient — get it out of the live queue
  # so it doesn't block fresh events while we debug.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ses_events_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue" "ses_events_dlq" {
  name                      = "cromo-${var.env}-ses-events-dlq"
  message_retention_seconds = 1209600
}

# Queue policy: only the two SES SNS topics can publish messages. Anyone
# else (a typo'd topic ARN, an unrelated SNS topic in the account) is
# refused before the message lands. This is what replaces the SNS
# signature verification we did in the old HTTPS webhook.
data "aws_iam_policy_document" "queue_policy" {
  statement {
    sid     = "AllowBounceTopic"
    effect  = "Allow"
    actions = ["sqs:SendMessage"]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    resources = [aws_sqs_queue.ses_events.arn]
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [var.bounce_topic_arn]
    }
  }
  statement {
    sid     = "AllowComplaintTopic"
    effect  = "Allow"
    actions = ["sqs:SendMessage"]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    resources = [aws_sqs_queue.ses_events.arn]
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [var.complaint_topic_arn]
    }
  }
}

resource "aws_sqs_queue_policy" "ses_events" {
  queue_url = aws_sqs_queue.ses_events.id
  policy    = data.aws_iam_policy_document.queue_policy.json
}

# SNS → SQS subscriptions. raw_message_delivery = true so the backend
# receives the SES event payload directly instead of the SNS envelope
# wrapped around it — one less unwrap step in the poller.
resource "aws_sns_topic_subscription" "bounces" {
  topic_arn            = var.bounce_topic_arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.ses_events.arn
  raw_message_delivery = true
}

resource "aws_sns_topic_subscription" "complaints" {
  topic_arn            = var.complaint_topic_arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.ses_events.arn
  raw_message_delivery = true
}

# IAM grant: the backend's EC2 role can long-poll, read, and delete
# messages from the events queue. Attached as a separate policy (not
# inline on the role) so the compute module stays SES-agnostic.
data "aws_iam_policy_document" "consumer_grant" {
  statement {
    sid = "ConsumeSesEvents"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
    ]
    resources = [aws_sqs_queue.ses_events.arn]
  }
}

resource "aws_iam_policy" "consumer_grant" {
  name   = "cromo-${var.env}-ses-events-consume"
  policy = data.aws_iam_policy_document.consumer_grant.json
}

resource "aws_iam_role_policy_attachment" "consumer_grant" {
  role       = var.consumer_role_name
  policy_arn = aws_iam_policy.consumer_grant.arn
}
