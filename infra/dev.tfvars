# Non-secret settings for the deployed `dev` environment. Committed, and used by
# both the CI/CD pipeline and local runs:
#
#   terraform plan -var-file=dev.tfvars
#
# Secrets do NOT go here. In CI they arrive as TF_VAR_* environment variables
# from GitHub secrets; locally keep them in terraform.tfvars (gitignored), which
# Terraform still loads automatically. See docs/ci-cd.md.

aws_region  = "us-west-1"
environment = "dev"

scryfall_user_agent = "MTGManager/0.1 (https://github.com/morrisontrevor03/mtg-manager)"

db_instance_class        = "db.t4g.micro"
db_allocated_storage     = 20
db_backup_retention_days = 7
db_deletion_protection   = false
db_multi_az              = false

# Must match the --arch passed to `npm run lambda:build`.
lambda_architecture         = "arm64"
lambda_memory_mb            = 1024
lambda_reserved_concurrency = -1

# "Sign in with Google". Empty until a Google OAuth client exists; see
# docs/accounts.md. The client id is public; its secret comes from the
# GOOGLE_CLIENT_SECRET GitHub secret (TF_VAR_google_client_secret).
google_client_id = "377594108583-7gl9o994k54nm1lih0fn587n59is56p2.apps.googleusercontent.com"

# Off on purpose until the async rebuild; see infra/README.md.
enable_deck_builder = false
