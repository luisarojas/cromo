variable "env" {
  description = "Environment slug (dev / prod) — used in role/policy names and the SSM tag scope."
  type        = string
}

variable "github_sub_patterns" {
  description = <<-EOT
    Allowed values for the GitHub OIDC token's `sub` claim. Anything outside
    these patterns is rejected by STS. Wildcards (`*`) are matched via
    StringLike. Examples:

      ["repo:Luisarojas/cromo:ref:refs/heads/main"]      # dev: main branch only
      ["repo:Luisarojas/cromo:ref:refs/tags/v*"]         # prod: v-prefix tags only
      ["repo:Luisarojas/cromo:environment:prod"]         # gate via GitHub environment

    See https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#example-subject-claims
  EOT
  type        = list(string)
}

variable "uploads_bucket_arn" {
  description = "ARN of the env's S3 uploads bucket. The deploy workflow writes docker-compose.prod.yml to its _deploy/ prefix."
  type        = string
}
