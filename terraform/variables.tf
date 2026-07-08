variable "github_owner" {
  description = "GitHub organization or user that owns the repository"
  type        = string
  default     = "kkaiki"
}

variable "github_token" {
  description = "GitHub personal access token with repo admin scope. Defaults to the GITHUB_TOKEN environment variable when unset."
  type        = string
  default     = null
  sensitive   = true
}
