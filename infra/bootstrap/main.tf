# One-time setup for the CI/CD pipeline. Apply this once from your own machine,
# before the main stack moves to remote state. See docs/ci-cd.md.
#
# It creates the two things the pipeline cannot create for itself:
#
#   1. The S3 bucket that holds the main stack's Terraform state.
#   2. The IAM roles GitHub Actions assumes through OIDC, so no long-lived AWS
#      keys are ever stored in GitHub.
#
# This stack's own state stays local. It holds no secrets, and every resource in
# it can be re-imported if the file is lost.

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile != "" ? var.aws_profile : null

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
      Component = "ci-bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # Bucket names are global; the account id keeps this one unique.
  state_bucket = "${var.project_name}-tfstate-${data.aws_caller_identity.current.account_id}"

  # GitHub's OIDC `sub` claim pins the owner and repository by numeric id as well
  # as by name: `repo:owner@123/name@456:...`. Trusting the ids means a deleted
  # and re-created repository of the same name, which gets a new id, cannot
  # assume these roles.
  subject_prefix = "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}"
}

# --- State bucket ---------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket

  # The main stack's state holds the RDS password. Losing this bucket would
  # orphan every resource in that stack.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  # Every apply writes a new state version; versioning is the undo button.
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# --- GitHub OIDC provider -------------------------------------------------
#
# An account can hold only one provider per URL. If another project already
# created it, set create_github_oidc_provider = false and it is looked up instead.

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )
}

# Builds a trust policy that admits GitHub tokens whose `sub` claim matches one
# of the given patterns, and nothing else.
data "aws_iam_policy_document" "trust" {
  for_each = {
    plan = [
      "${local.subject_prefix}:pull_request",
      "${local.subject_prefix}:ref:refs/heads/${var.default_branch}",
    ]
    # Only jobs running in the protected `production` environment, which
    # requires your approval in GitHub before it starts.
    apply = ["${local.subject_prefix}:environment:${var.deploy_environment}"]
  }

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = each.value
    }
  }
}

# --- Plan role: read-only, used on pull requests --------------------------

resource "aws_iam_role" "plan" {
  name                 = "${var.project_name}-github-plan"
  assume_role_policy   = data.aws_iam_policy_document.trust["plan"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "plan_extra" {
  # ReadOnlyAccess omits secret values, but refreshing the database URL secret
  # version during `terraform plan` reads it.
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}-*"]
  }

  # Read-only on state. The workflow plans with -lock=false, so this role never
  # needs to write the .tflock object, and code in a pull request cannot
  # overwrite state with it.
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }

  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.state.arn}/${var.project_name}/*"]
  }
}

resource "aws_iam_role_policy" "plan_extra" {
  name   = "terraform-plan"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan_extra.json
}

# --- Apply role: full deploy, gated by the GitHub environment -------------
#
# AdministratorAccess is deliberate. The main stack creates IAM roles for its
# Lambdas, and permission to create and pass IAM roles is already equivalent to
# admin, so a hand-scoped policy would add maintenance without adding much
# protection. The real guard is the trust policy above: only a job in the
# `production` environment, which waits for your approval, can assume this role.

resource "aws_iam_role" "apply" {
  name                 = "${var.project_name}-github-apply"
  assume_role_policy   = data.aws_iam_policy_document.trust["apply"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "apply_admin" {
  role       = aws_iam_role.apply.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
