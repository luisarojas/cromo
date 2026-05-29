terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# ─── IAM ──────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "cromo-${var.env}-app"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# SSM Session Manager — replaces SSH entirely. Don't expose port 22.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Pull images from ECR.
resource "aws_iam_role_policy_attachment" "ecr_pull" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# Read the runtime secret + write uploads + send via SES + CloudWatch logs.
data "aws_iam_policy_document" "app_inline" {
  statement {
    sid       = "ReadAppSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.secret_arn]
  }
  statement {
    sid     = "S3Uploads"
    actions = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      var.uploads_bucket_arn,
      "${var.uploads_bucket_arn}/*",
    ]
  }
  statement {
    sid       = "SESSend"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }
  statement {
    sid = "CloudWatchLogs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:*:*:*"]
  }

  # Privileged Cognito ops used by the moderation surface (role changes,
  # account disable/delete). The unauthenticated auth flows the broker uses
  # (SignUp/InitiateAuth/etc.) need no IAM. Omitted when no pool is wired.
  dynamic "statement" {
    for_each = var.user_pool_arn != "" ? [1] : []
    content {
      sid = "CognitoAdmin"
      actions = [
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminRemoveUserFromGroup",
        "cognito-idp:AdminDisableUser",
        "cognito-idp:AdminDeleteUser",
        "cognito-idp:AdminGetUser",
      ]
      resources = [var.user_pool_arn]
    }
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "cromo-${var.env}-app-inline"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app_inline.json
}

resource "aws_iam_instance_profile" "app" {
  name = "cromo-${var.env}-app"
  role = aws_iam_role.app.name
}

# ─── ACM cert for the ALB ─────────────────────────────────────────────────────

resource "aws_acm_certificate" "alb" {
  domain_name       = var.hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.alb.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "alb" {
  certificate_arn         = aws_acm_certificate.alb.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ─── ALB ──────────────────────────────────────────────────────────────────────

resource "aws_lb" "main" {
  name                       = "cromo-${var.env}"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [var.alb_sg_id]
  subnets                    = var.alb_subnet_ids
  enable_deletion_protection = var.deletion_protection
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "frontend" {
  name        = "cromo-${var.env}-fe"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    path                = "/"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "api" {
  name        = "cromo-${var.env}-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    path                = "/api/v1/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# HTTP → HTTPS redirect
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.alb.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# /api/* → API target group; everything else → frontend.
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern { values = ["/api/*"] }
  }
}

# ─── EC2 instance ─────────────────────────────────────────────────────────────

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-6.1-x86_64"]
  }
}

# User-data: install Docker, log in to ECR, fetch the runtime secret into
# /etc/cromo/cromo.env, then `docker compose up`.
locals {
  user_data = <<-BASH
    #!/bin/bash
    set -euxo pipefail
    dnf update -y
    dnf install -y docker jq awscli amazon-ssm-agent
    systemctl enable --now docker amazon-ssm-agent
    usermod -aG docker ec2-user

    # Install docker compose v2 plugin
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

    # Render runtime env file from Secrets Manager.
    mkdir -p /etc/cromo
    aws secretsmanager get-secret-value \
      --secret-id ${var.secret_arn} \
      --region ${var.region} \
      --query SecretString \
      --output text \
      | jq -r 'to_entries | map("\(.key)=\(.value | @sh)") | .[]' \
      > /etc/cromo/cromo.env
    chmod 600 /etc/cromo/cromo.env

    # ECR login
    aws ecr get-login-password --region ${var.region} \
      | docker login --username AWS --password-stdin ${var.ecr_registry}

    # Fetch compose file from S3 (uploaded by the deploy pipeline) and start.
    aws s3 cp s3://${var.uploads_bucket}/_deploy/docker-compose.prod.yml /opt/cromo/docker-compose.yml || true
    if [ -f /opt/cromo/docker-compose.yml ]; then
      cd /opt/cromo
      export ECR_REGISTRY=${var.ecr_registry}
      # The deploy pipeline publishes a moving "<env>-latest" tag (plus the git
      # SHA). A cold-booted instance (e.g. business-hours scale-up) has no
      # IMAGE_TAG, so fall back to that moving tag — NOT "latest", which the
      # pipeline never pushes and would leave the app unstarted.
      export IMAGE_TAG=$${IMAGE_TAG:-${var.env}-latest}
      export CROMO_ENV=${var.env}
      docker compose pull || true
      docker compose up -d || true
    fi
  BASH
}

resource "aws_launch_template" "app" {
  name_prefix   = "cromo-${var.env}-"
  image_id      = data.aws_ami.al2023.id
  instance_type = var.instance_type

  iam_instance_profile { name = aws_iam_instance_profile.app.name }
  vpc_security_group_ids = [var.app_sg_id]
  user_data              = base64encode(local.user_data)

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "cromo-${var.env}-app" }
  }
}

# Single instance for dev — an autoscaling group of size 1 still gives us
# self-healing on instance failure without needing the cost or complexity of
# multi-instance orchestration.
resource "aws_autoscaling_group" "app" {
  name                = "cromo-${var.env}-app"
  vpc_zone_identifier = var.app_subnet_ids
  min_size            = 1
  max_size            = 1
  desired_capacity    = 1

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  target_group_arns = [
    aws_lb_target_group.frontend.arn,
    aws_lb_target_group.api.arn,
  ]

  health_check_type         = "ELB"
  health_check_grace_period = 300

  tag {
    key                 = "Name"
    value               = "cromo-${var.env}-app"
    propagate_at_launch = true
  }
}
