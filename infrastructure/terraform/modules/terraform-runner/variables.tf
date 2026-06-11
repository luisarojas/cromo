variable "github_sub_patterns" {
  description = <<-EOT
    Allowed values for the GitHub OIDC token's `sub` claim. The Terraform
    workflow assumes the role under one of these patterns; anything else
    is rejected by STS. Use GitHub Environments (which support required
    reviewers + protection rules) rather than raw branch refs:

      ["repo:Luisarojas/cromo:environment:tf-dev",
       "repo:Luisarojas/cromo:environment:tf-prod",
       "repo:Luisarojas/cromo:environment:tf-shared"]

    Required-reviewer gating then happens in the GitHub UI per environment,
    not in IAM — which is the cleaner separation of concerns.
  EOT
  type        = list(string)
}

variable "max_session_duration_seconds" {
  description = "Max session length when assumed. Default 2h gives applies headroom over the AWS default 1h."
  type        = number
  default     = 7200
}
