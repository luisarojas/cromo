variable "env" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "cache_sg_id" { type = string }

variable "node_type" {
  type    = string
  default = "cache.t3.micro"
}

variable "num_cache_clusters" {
  description = "Number of nodes in the replication group. 1 = single-node (dev). 2+ = primary + replica(s) for prod HA."
  type        = number
  default     = 1
}

variable "automatic_failover_enabled" {
  description = "Promote a replica to primary if the primary fails. Requires num_cache_clusters >= 2."
  type        = bool
  default     = false
}

variable "multi_az_enabled" {
  description = "Place primary and replica in different AZs. Requires automatic_failover_enabled = true."
  type        = bool
  default     = false
}
