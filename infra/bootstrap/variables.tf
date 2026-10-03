variable "aws_region" {
  description = "Region for the state bucket. Keep it the same as the main stack's."
  type        = string
  default     = "us-west-1"
}

variable "aws_profile" {
  description = "Named AWS CLI profile to use. Empty uses the default credential chain."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Name prefix, matching the main stack's project_name."
  type        = string
  default     = "mtg-manager"
}

variable "github_owner" {
  description = "GitHub user or organisation that owns the repository."
  type        = string
}

variable "github_repo" {
  description = "Repository name on GitHub."
  type        = string
  default     = "mtg-manager"
}

variable "default_branch" {
  description = "Branch whose pushes run the plan job ahead of a deploy."
  type        = string
  default     = "main"
}

variable "deploy_environment" {
  description = "GitHub environment the apply job runs in. Must match the workflow."
  type        = string
  default     = "production"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider. Set false if the account already has one."
  type        = bool
  default     = true
}
