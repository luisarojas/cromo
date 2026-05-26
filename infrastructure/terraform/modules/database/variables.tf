variable "env" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "db_sg_id" { type = string }

variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = false
}
