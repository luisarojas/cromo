variable "env" { type = string }

variable "values" {
  description = "Map of env-var name → value. Sensitive; full content is stored encrypted."
  type        = map(string)
  sensitive   = true
}
