terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

# CloudFront edge in front of:
#   1. The uploads bucket (avatars, eventually scan thumbnails) — public reads
#      go through CloudFront via Origin Access Control, the bucket itself
#      stays fully private.
#   2. (Optional) the ALB — when alb_domain is non-empty, an additional origin
#      is added so /api/* and /_next/* can be edge-cached too. The default
#      cache behaviour still forwards uncached paths to the bucket so the
#      flag flip is non-breaking.
#
# All resources are CloudFront-flavoured (provider aliased to us-east-1 in the
# caller). The module assumes the caller has the ACM cert provisioned in
# us-east-1 if they want a custom alias.

# ─── Origin Access Control for the uploads bucket ─────────────────────────────

resource "aws_cloudfront_origin_access_control" "uploads" {
  name                              = "cromo-${var.env}-uploads-oac"
  description                       = "OAC for cromo ${var.env} uploads bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ─── CloudFront distribution ──────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Cromo ${var.env} CDN"
  price_class     = var.price_class
  http_version    = "http2and3"

  # Custom alias only when a hostname is provided. Without one, the
  # distribution still works via its *.cloudfront.net domain.
  aliases = var.cdn_hostname == "" ? [] : [var.cdn_hostname]

  origin {
    domain_name              = var.uploads_bucket_regional_domain
    origin_id                = "uploads"
    origin_access_control_id = aws_cloudfront_origin_access_control.uploads.id
  }

  # Default behaviour — point at the uploads bucket. Avatars are immutable
  # per-userId (overwritten on change) so the ~1h cache is a nice default;
  # callers can bust via ?v= query string when they start versioning.
  default_cache_behavior {
    target_origin_id       = "uploads"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true

    forwarded_values {
      query_string = true
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 3600  # 1h — matches the S3 PutObject CacheControl we send
    max_ttl     = 86400 # 24h
  }

  viewer_certificate {
    cloudfront_default_certificate = var.cdn_hostname == ""
    acm_certificate_arn            = var.cdn_hostname == "" ? null : var.acm_certificate_arn
    ssl_support_method             = var.cdn_hostname == "" ? null : "sni-only"
    minimum_protocol_version       = var.cdn_hostname == "" ? "TLSv1" : "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# Allow CloudFront to read from the bucket. Bucket itself stays fully private.

data "aws_iam_policy_document" "uploads_bucket" {
  statement {
    sid     = "AllowCloudFrontReadOnly"
    actions = ["s3:GetObject"]
    resources = [
      "${var.uploads_bucket_arn}/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = var.uploads_bucket_name
  policy = data.aws_iam_policy_document.uploads_bucket.json
}
