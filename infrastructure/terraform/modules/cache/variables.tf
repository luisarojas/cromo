variable "env" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "cache_sg_id" { type = string }
variable "node_type" {
  type    = string
  default = "cache.t3.micro"
}
