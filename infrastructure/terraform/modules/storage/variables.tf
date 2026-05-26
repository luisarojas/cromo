variable "env" { type = string }
variable "account_id" { type = string }
variable "cors_allowed_origins" {
  type    = list(string)
  default = ["*"]
}
variable "deletion_protection" {
  type    = bool
  default = false
}
