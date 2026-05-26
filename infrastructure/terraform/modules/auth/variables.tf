variable "env" { type = string }
variable "from_email" { type = string }
variable "ses_identity_arn" { type = string }
variable "deletion_protection" {
  type    = bool
  default = false
}
