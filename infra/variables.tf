# --- Identity and placement -----------------------------------------------

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Named AWS CLI profile to use. Empty uses the default credential chain."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Name prefix for every resource."
  type        = string
  default     = "mtg-manager"
}

variable "environment" {
  description = "Environment suffix, e.g. dev or prod."
  type        = string
  default     = "dev"
}

variable "extra_tags" {
  description = "Additional tags applied to every resource."
  type        = map(string)
  default     = {}
}

# --- Networking -----------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

# --- Database -------------------------------------------------------------

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is the cheapest Graviton option and ample for one user."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "Postgres major version. Minor upgrades are applied automatically."
  type        = string
  default     = "16"
}

variable "db_allocated_storage" {
  description = "Initial storage in GB. Autoscales up to db_max_allocated_storage."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling in GB. Set equal to db_allocated_storage to disable."
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "mtg"
}

variable "db_username" {
  description = "Master username. 'admin' and 'postgres' are reserved by RDS."
  type        = string
  default     = "mtgadmin"
}

variable "db_backup_retention_days" {
  description = "Days of automated backups to keep. 0 disables backups."
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Block `terraform destroy` from deleting the database. Turn on for anything you care about."
  type        = bool
  default     = false
}

variable "db_multi_az" {
  description = "Run a standby in a second AZ. Roughly doubles database cost."
  type        = bool
  default     = false
}

# --- Lambda ---------------------------------------------------------------

variable "lambda_architecture" {
  description = "Lambda architecture. Must match the --arch passed to lambda/build.mjs."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda_architecture)
    error_message = "lambda_architecture must be arm64 or x86_64."
  }
}

variable "lambda_memory_mb" {
  description = "Memory for the API function. More memory also means more CPU, which shortens Prisma's cold start."
  type        = number
  default     = 1024
}

variable "lambda_timeout_seconds" {
  description = <<-EOT
    Timeout for the API function. API Gateway caps any integration at 29 seconds,
    so values above 29 only let the function keep working after the client has
    already received a 504.
  EOT
  type        = number
  default     = 29

  validation {
    condition     = var.lambda_timeout_seconds > 0 && var.lambda_timeout_seconds <= 900
    error_message = "lambda_timeout_seconds must be between 1 and 900."
  }
}

variable "lambda_reserved_concurrency" {
  description = <<-EOT
    Maximum concurrent API invocations, or -1 for no reservation.

    This is the database connection guard: each warm instance holds one Postgres
    connection, and db.t4g.micro allows only about 110.

    Defaults to -1 because a reservation is impossible on a new AWS account. AWS
    requires at least 10 concurrent executions to remain unreserved, and a new
    account's total limit is 10 — so reserving even 1 is rejected. Until you raise
    that quota (Service Quotas -> Lambda -> Concurrent executions), the account
    limit is itself the connection bound, which is the same protection. Once the
    quota is raised, set this to a real number.
  EOT
  type        = number
  default     = -1

  validation {
    condition     = var.lambda_reserved_concurrency == -1 || var.lambda_reserved_concurrency >= 1
    error_message = "lambda_reserved_concurrency must be -1 (no reservation) or at least 1."
  }
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the Lambda and API Gateway log groups."
  type        = number
  default     = 14
}

# --- Application ----------------------------------------------------------

variable "enable_deck_builder" {
  description = <<-EOT
    Enable the POST /api/decks/build LLM route. Off by default: the route is
    declared maxDuration = 300 in the app and cannot complete within API
    Gateway's 29-second ceiling. While disabled the route returns 503.
  EOT
  type        = bool
  default     = false
}

variable "anthropic_api_key" {
  description = "Anthropic API key. Only needed when enable_deck_builder is true."
  type        = string
  default     = ""
  sensitive   = true
}

variable "scryfall_user_agent" {
  description = "User-Agent sent to the Scryfall API, which asks for a descriptive one."
  type        = string
  default     = "MTGManager/0.1 (https://github.com/your-handle/mtg-manager)"
}

variable "api_shared_secret" {
  description = <<-EOT
    Optional shared secret. When set, every request must carry it as an
    `x-api-key` header or the API returns 401.

    The app has no user accounts, so an empty value leaves the API open to anyone
    who learns the URL — including the routes that write to your collection. Set
    this unless you have put another authorizer in front.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "cors_allowed_origins" {
  description = <<-EOT
    Browser origins allowed to call the API, e.g. your CloudFront domain.

    Not needed if you route /api/* to this API through a CloudFront behaviour on
    the same domain as the frontend, which is the recommended setup — same-origin
    requests never trigger CORS. ["*"] allows any origin.
  EOT
  type        = list(string)
  default     = []
}

variable "run_migrations_on_apply" {
  description = <<-EOT
    Invoke the migration Lambda during `terraform apply` whenever the migration
    SQL changes. Set to false to apply migrations manually instead (see infra/README.md).
  EOT
  type        = bool
  default     = true
}

# --- Frontend -------------------------------------------------------------

variable "cloudfront_price_class" {
  description = <<-EOT
    CloudFront edge locations to use. PriceClass_100 (North America + Europe) is
    the cheapest; PriceClass_All adds the rest at a higher per-request rate.
  EOT
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}
