# API Gateway HTTP API in front of the backend Lambda.
#
# HTTP API rather than REST API: it is cheaper (~$1.00 vs $3.50 per million
# requests), supports the 2.0 payload the handler expects, and has native CORS.
# Its one hard limit is a 29-second integration timeout, which is why the LLM
# deck builder runs as an async job on a separate worker (see deck_worker.tf).

locals {
  # Must stay in step with ROUTE_KEYS in lambda/src/routeKeys.ts.
  # `npm run lambda:check` compares the two and fails if they drift.
  api_routes = [
    "GET /api/cards/search",
    "POST /api/cards/match",

    "GET /api/dashboard",

    "GET /api/collection",
    "POST /api/collection",
    "GET /api/collection/commanders",
    "POST /api/collection/import",
    "PATCH /api/collection/{id}",
    "DELETE /api/collection/{id}",

    "GET /api/decks",
    "POST /api/decks/build",
    "GET /api/decks/build/{id}",
    "GET /api/decks/{id}",
    "PATCH /api/decks/{id}",
    "DELETE /api/decks/{id}",
  ]

  # Liveness probe, served by the handler rather than the route table.
  health_route = "GET /api/health"
}

resource "aws_apigatewayv2_api" "main" {
  name          = "${local.name}-api"
  description   = "MTG Manager backend"
  protocol_type = "HTTP"

  # Only configured when origins are supplied. The recommended setup puts the
  # API behind the same CloudFront domain as the frontend, where requests are
  # same-origin and CORS never comes into play.
  dynamic "cors_configuration" {
    for_each = length(var.cors_allowed_origins) > 0 ? [1] : []

    content {
      allow_origins = var.cors_allowed_origins
      allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
      allow_headers = ["content-type", "x-api-key", "authorization"]
      max_age       = 3600
      # No cookies are used; the shared secret and the bearer token travel in headers.
      allow_credentials = false
    }
  }

  tags = { Name = "${local.name}-api" }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"

  # Capped by API Gateway at 30s regardless of what the function allows.
  timeout_milliseconds = min(var.lambda_timeout_seconds * 1000, 29000)
}

# One explicit route per endpoint rather than a catch-all $default, so an unknown
# path is rejected by the gateway for free instead of paying for an invocation
# just to return 404.
resource "aws_apigatewayv2_route" "api" {
  for_each = toset(concat(local.api_routes, [local.health_route]))

  api_id    = aws_apigatewayv2_api.main.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"

  # Every application route requires a valid Cognito access token, checked here
  # before the Lambda is invoked. Only the health probe stays open, so the
  # deploy pipeline's smoke test needs no credentials.
  authorization_type = each.value == local.health_route ? "NONE" : "JWT"
  authorizer_id      = each.value == local.health_route ? null : aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"

  # Scoped to this API; any stage, any method, any path.
  source_arn = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# --- Stage ----------------------------------------------------------------

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigateway/${local.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      httpMethod       = "$context.httpMethod"
      path             = "$context.path"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLatency  = "$context.responseLatency"
      integrationError = "$context.integrationErrorMessage"
      sourceIp         = "$context.identity.sourceIp"
      userAgent        = "$context.identity.userAgent"
    })
  }

  default_route_settings {
    # A ceiling, not a target. One user cannot generate this, so anything near it
    # is a loop or someone else — and it keeps a runaway client from both the
    # Lambda bill and the database connection pool.
    throttling_rate_limit    = 50
    throttling_burst_limit   = 100
    detailed_metrics_enabled = true
  }

  tags = { Name = "${local.name}-stage" }
}
