output "api_base_url" {
  description = "Base URL of the deployed backend. Routes live under /api/*."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_gateway_domain" {
  description = "API Gateway domain, for use as a CloudFront origin for /api/* behaviours."
  value       = replace(aws_apigatewayv2_api.main.api_endpoint, "https://", "")
}

output "health_check_url" {
  description = "GET this to confirm the Lambda can reach the database."
  value       = "${aws_apigatewayv2_stage.default.invoke_url}api/health"
}

output "database_endpoint" {
  description = "RDS endpoint. Private to the VPC — not reachable from the internet."
  value       = aws_db_instance.main.endpoint
}

output "database_url_secret_name" {
  description = "Secrets Manager secret holding the Prisma connection URL and credentials."
  value       = aws_secretsmanager_secret.database_url.name
}

output "database_url_command" {
  description = "Retrieve the connection URL without reading Terraform state."
  value       = "aws secretsmanager get-secret-value --secret-id ${aws_secretsmanager_secret.database_url.name} --query SecretString --output text"
}

output "api_function_name" {
  description = "Name of the API Lambda function."
  value       = aws_lambda_function.api.function_name
}

output "migrate_function_name" {
  description = "Name of the migration Lambda function."
  value       = aws_lambda_function.migrate.function_name
}

output "migrate_command" {
  description = "Apply pending migrations by hand."
  value       = "aws lambda invoke --function-name ${aws_lambda_function.migrate.function_name} --cli-binary-format raw-in-base64-out --payload '{}' /dev/stdout"
}

output "deck_builder_enabled" {
  description = "Whether POST /api/decks/build is live. When false it returns 503."
  value       = var.enable_deck_builder
}

output "api_requires_shared_secret" {
  description = "Whether callers must send an x-api-key header. False means the API is open to anyone with the URL."
  # nonsensitive() is safe here: the result is a boolean, never the secret.
  value = nonsensitive(var.api_shared_secret != "")
}

# --- Frontend -------------------------------------------------------------

output "site_url" {
  description = "Open this. Serves the frontend and proxies /api/* to the backend."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "site_bucket" {
  description = "S3 bucket holding the exported frontend. Private; readable only by CloudFront."
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "Distribution id, for a manual cache invalidation if you ever need one."
  value       = aws_cloudfront_distribution.site.id
}

# --- Accounts -------------------------------------------------------------

output "cognito_user_pool_id" {
  description = "Cognito user pool holding the app's accounts."
  value       = aws_cognito_user_pool.main.id
}

output "google_redirect_uri" {
  description = "Paste into the Google OAuth client's \"Authorized redirect URIs\"."
  value       = "https://${local.auth_config.oauthDomain}/oauth2/idpresponse"
}

output "auth_config_json" {
  description = "Frontend auth config. `npm run auth:config` writes it to public/ for local development."
  value       = jsonencode(local.auth_config)
}
