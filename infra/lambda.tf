# The backend itself: one deployment package, three functions.
#
# `index.handler` serves the API; `worker.handler` runs deck builds (see
# deck_worker.tf); `migrate.handler` applies Prisma migrations from inside the
# VPC. They share a zip because they share the Prisma client and query engine,
# which is the bulk of its ~23MB.

locals {
  package_dir = "${path.module}/../lambda/dist/package"

  # A plain string rather than a reference to the function, because the shared
  # environment below names it and the worker itself uses that environment.
  deck_worker_name = "${local.name}-deck-worker"

  # Prisma resolves its native engine relative to the generated client, which
  # works because build.mjs copies the client in as real files rather than
  # letting the bundler inline it. Naming the library explicitly removes any
  # platform sniffing at cold start.
  query_engine = var.lambda_architecture == "arm64" ? "libquery_engine-linux-arm64-openssl-3.0.x.so.node" : "libquery_engine-rhel-openssl-3.0.x.so.node"

  lambda_environment = {
    DATABASE_URL                = local.database_url
    PRISMA_QUERY_ENGINE_LIBRARY = "/var/task/node_modules/.prisma/client/${local.query_engine}"
    NODE_ENV                    = "production"
    SCRYFALL_UA                 = var.scryfall_user_agent
    # Egress is IPv6-only. Node would otherwise be free to try an A record first
    # and sit in a connect timeout before falling back, so prefer AAAA outright.
    NODE_OPTIONS        = "--dns-result-order=ipv6first"
    ENABLE_DECK_BUILDER = var.enable_deck_builder ? "true" : "false"
    ANTHROPIC_API_KEY   = var.anthropic_api_key
    # The API invokes this function to run a queued build.
    DECK_WORKER_FUNCTION = local.deck_worker_name
    API_SHARED_SECRET    = var.api_shared_secret
    # API Gateway's JWT authorizer verifies Cognito tokens before invocation;
    # route handlers read the verified user from a header the handler sets.
    AUTH_MODE                           = "gateway"
    AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
  }
}

data "archive_file" "backend" {
  type        = "zip"
  source_dir  = local.package_dir
  output_path = "${path.module}/.terraform/mtg-manager-backend.zip"
}

# --- IAM ------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = { Name = "${local.name}-lambda-role" }
}

# Grants the ENI management a VPC-attached function needs, plus CloudWatch Logs.
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# --- API function ---------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = "${local.name}-api"
  description   = "MTG Manager backend API (Next.js route handlers on Lambda)"
  role          = aws_iam_role.lambda.arn

  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  runtime       = "nodejs20.x"
  architectures = [var.lambda_architecture]
  handler       = "index.handler"

  memory_size = var.lambda_memory_mb
  timeout     = var.lambda_timeout_seconds

  reserved_concurrent_executions = var.lambda_reserved_concurrency

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]

    # Gives the ENI an IPv6 address, which is what makes the egress-only
    # internet gateway usable. Without this there is no route off the VPC.
    ipv6_allowed_for_dual_stack = true
  }

  environment {
    variables = local.lambda_environment
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy_attachment.lambda_vpc,
  ]

  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/../lambda/dist/package/index.js")
      error_message = "Deployment package missing. Run `npm run lambda:build` in mtg-manager/ before applying."
    }
  }

  tags = { Name = "${local.name}-api" }
}

# --- Migration function ---------------------------------------------------

resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/aws/lambda/${local.name}-migrate"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "migrate" {
  function_name = "${local.name}-migrate"
  description   = "Applies Prisma migrations to the MTG Manager database"
  role          = aws_iam_role.lambda.arn

  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  runtime       = "nodejs20.x"
  architectures = [var.lambda_architecture]
  handler       = "migrate.handler"

  memory_size = 512
  # DDL on an empty database is quick, but a cold RDS instance plus a long
  # migration chain should not be racing a short timeout.
  timeout = 300

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]

    # Gives the ENI an IPv6 address, which is what makes the egress-only
    # internet gateway usable. Without this there is no route off the VPC.
    ipv6_allowed_for_dual_stack = true
  }

  environment {
    variables = local.lambda_environment
  }

  depends_on = [
    aws_cloudwatch_log_group.migrate,
    aws_iam_role_policy_attachment.lambda_vpc,
  ]

  tags = { Name = "${local.name}-migrate" }
}

# Applies migrations on apply, re-running only when the SQL actually changes.
# The runner is idempotent: migrations already in Prisma's `_prisma_migrations`
# ledger are skipped.
resource "aws_lambda_invocation" "migrate" {
  count = var.run_migrations_on_apply ? 1 : 0

  function_name = aws_lambda_function.migrate.function_name
  input         = jsonencode({})

  triggers = {
    migrations = sha256(join("", [
      for f in sort(fileset("${path.module}/../prisma/migrations", "**/migration.sql")) :
      filesha256("${path.module}/../prisma/migrations/${f}")
    ]))
  }

  depends_on = [aws_db_instance.main]
}
