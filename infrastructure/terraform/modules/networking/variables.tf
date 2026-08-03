variable "env" {
  description = "Environment slug (dev / staging / prod) — used in resource names."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "enable_nat_gateway" {
  description = "When true (default), provision NAT gateway(s) so private-subnet resources can egress. Set false for cheap environments (e.g. dev) that run their only egress-needing workload in a public subnet — no NAT gateway is created and the private route tables carry no default route. Saves ~$33/mo per NAT gateway."
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "When true, provision one NAT gateway in AZ-a and route every private subnet through it (cheap, AZ-fragile). When false, provision one NAT per AZ — each private subnet routes through the NAT in its own AZ, so an AZ outage doesn't sever egress for the surviving AZ."
  type        = bool
  default     = true
}

variable "alb_ingress_cidrs" {
  description = "CIDR blocks allowed to reach the ALB on ports 80 and 443. Default is open to the internet; restrict to specific IPs for non-prod environments."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
