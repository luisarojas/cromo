variable "env" {
  type        = string
  description = "Environment name (dev/prod)."
}

variable "uploads_bucket_name" {
  type        = string
  description = "Name of the S3 uploads bucket to front."
}

variable "uploads_bucket_arn" {
  type        = string
  description = "ARN of the S3 uploads bucket."
}

variable "uploads_bucket_regional_domain" {
  type        = string
  description = "Regional domain of the uploads bucket (bucket-name.s3.<region>.amazonaws.com)."
}

variable "cdn_hostname" {
  type        = string
  description = "Custom CNAME for the distribution (e.g. cdn.cromotrade.ca). Leave blank to use the default *.cloudfront.net domain."
  default     = ""
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate in us-east-1 for the custom hostname. Required when cdn_hostname is set."
  default     = ""
}

variable "price_class" {
  type        = string
  description = "CloudFront price class (PriceClass_100 covers NA + EU, the cheapest tier that includes our user base)."
  default     = "PriceClass_100"
}
