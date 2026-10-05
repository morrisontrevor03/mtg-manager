# The LLM deck-builder worker.
#
# A deck build runs for minutes, but API Gateway cuts every request at 29
# seconds. So POST /api/decks/build only records a job and invokes this function
# asynchronously; the page polls GET /api/decks/build/{id} for the result.
# Same package as the API, different handler (lambda/src/worker.ts).
#
# The API function reaches the Lambda service over IPv6 through the egress-only
# gateway, using the dual-stack endpoint (lambda.<region>.api.aws). No NAT and
# no VPC endpoint are needed.

resource "aws_cloudwatch_log_group" "deck_worker" {
  name              = "/aws/lambda/${local.deck_worker_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "deck_worker" {
  function_name = local.deck_worker_name
  description   = "Builds decks with the LLM, one job per invocation"
  role          = aws_iam_role.lambda.arn

  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  runtime       = "nodejs20.x"
  architectures = [var.lambda_architecture]
  handler       = "worker.handler"

  memory_size = var.lambda_memory_mb
  timeout     = var.deck_worker_timeout_seconds

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]

    # Anthropic and Scryfall are reached over IPv6, as for the API function.
    ipv6_allowed_for_dual_stack = true
  }

  environment {
    variables = local.lambda_environment
  }

  depends_on = [
    aws_cloudwatch_log_group.deck_worker,
    aws_iam_role_policy_attachment.lambda_vpc,
  ]

  tags = { Name = local.deck_worker_name }
}

# Lambda retries a failed async invocation twice by default. The worker records
# every failure on the job and returns normally, so a retry would only ever
# follow a crash or timeout, by which point the user has been told the build
# failed. Retrying would pay for a second build nobody is waiting for.
resource "aws_lambda_function_event_invoke_config" "deck_worker" {
  function_name                = aws_lambda_function.deck_worker.function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 300
}

# The API and worker share one role; this lets the API start the worker.
data "aws_iam_policy_document" "invoke_deck_worker" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.deck_worker.arn]
  }
}

resource "aws_iam_role_policy" "invoke_deck_worker" {
  name   = "invoke-deck-worker"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.invoke_deck_worker.json
}
