variable "name" {
  description = "myApplications application name (e.g. cromo-dev). Shown in the AWS console Applications view."
  type        = string
}

variable "description" {
  type    = string
  default = null
}
