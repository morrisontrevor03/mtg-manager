provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile != "" ? var.aws_profile : null

  default_tags {
    tags = local.tags
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "${var.project_name}-${var.environment}"

  tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Component   = "backend"
    },
    var.extra_tags,
  )

  # Two AZs: the minimum an RDS subnet group accepts.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}
