terraform {
  # 1.10 for the S3 backend's native lockfile.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.6"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Terraform state holds the generated RDS password and the assembled
  # DATABASE_URL, and the CI/CD pipeline needs to share it with you, so it lives
  # in an encrypted, versioned bucket created by infra/bootstrap.
  #
  # The bucket name contains the AWS account id, so it is supplied at init time
  # rather than committed (a partial backend configuration):
  #
  #   terraform init -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)"
  #
  # See docs/ci-cd.md for the one-time migration off local state.
  backend "s3" {
    key          = "mtg-manager/backend.tfstate"
    region       = "us-west-1"
    encrypt      = true
    use_lockfile = true
  }
}
