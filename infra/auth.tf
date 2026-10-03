# User accounts: a Cognito user pool with email + password sign-up and, once
# Google OAuth credentials are supplied, "Sign in with Google".
#
# The app's own pages (/login, /signup, /forgot-password) talk to Cognito
# directly; no Cognito-hosted UI is shown. The pool's domain still exists because
# Google sign-in is an OAuth redirect through Cognito's /oauth2 endpoints.
#
# API Gateway verifies every access token itself (the JWT authorizer below)
# before the Lambda runs, so the function never handles an unverified token.

locals {
  google_enabled = var.google_client_id != ""

  # The static export emits directory-style URLs (`/auth/callback/`) while
  # `next dev` serves them without the slash. Cognito compares redirect URIs
  # exactly, so both spellings are registered for both origins.
  auth_origins = concat(
    ["https://${aws_cloudfront_distribution.site.domain_name}"],
    var.local_dev_origin != "" ? [var.local_dev_origin] : [],
  )
  auth_callback_urls = flatten([for o in local.auth_origins : ["${o}/auth/callback", "${o}/auth/callback/"]])
  auth_logout_urls   = flatten([for o in local.auth_origins : ["${o}/login", "${o}/login/"]])
}

resource "aws_cognito_user_pool" "main" {
  name = "${local.name}-users"

  # Lite covers password sign-in, email verification and social federation,
  # which is everything this app uses, at the lowest per-user price.
  user_pool_tier = "LITE"

  # Users sign in with their email address; there is no separate username.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 10
    require_lowercase                = true
    require_numbers                  = true
    require_uppercase                = false
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your MTG Manager verification code"
    email_message        = "Your MTG Manager verification code is {####}."
  }

  # Cognito's built-in sender: free, but capped at 50 emails a day per account.
  # Move to SES (email_sending_account = "DEVELOPER") before that matters.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 3
      max_length = 254
    }
  }

  # The pool is the only record of who owns which collection; destroying it
  # would orphan every row. Flip to INACTIVE before a deliberate teardown.
  deletion_protection = "ACTIVE"

  tags = { Name = "${local.name}-users" }
}

# Hosts Cognito's /oauth2 endpoints, which the Google redirect flow goes through.
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${local.name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_identity_provider" "google" {
  count = local.google_enabled ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
  }
}

# A public client for the browser: no secret (a static site cannot keep one),
# SRP for passwords so the password itself never crosses the wire, and the
# authorization-code flow with PKCE for Google.
resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # "Incorrect email or password" either way, rather than revealing which
  # emails have accounts.
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  supported_identity_providers = concat(
    ["COGNITO"],
    local.google_enabled ? [aws_cognito_identity_provider.google[0].provider_name] : [],
  )

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = local.auth_callback_urls
  logout_urls                          = local.auth_logout_urls

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  read_attributes = ["email", "email_verified", "name"]
}

# --- API Gateway ----------------------------------------------------------

# Cognito access tokens carry `client_id` rather than `aud`; API Gateway checks
# either claim against `audience`.
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  name             = "${local.name}-cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://${aws_cognito_user_pool.main.endpoint}"
    audience = [aws_cognito_user_pool_client.web.id]
  }
}

# --- Frontend runtime config ----------------------------------------------
#
# The frontend is built before Terraform runs, so it cannot have the pool ids
# baked in. It fetches this file at startup instead. Nothing in it is secret:
# these values are visible to any browser that signs in.

locals {
  auth_config = {
    region           = var.aws_region
    userPoolId       = aws_cognito_user_pool.main.id
    userPoolClientId = aws_cognito_user_pool_client.web.id
    oauthDomain      = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
    googleEnabled    = local.google_enabled
  }
}

resource "aws_s3_object" "auth_config" {
  bucket        = aws_s3_bucket.site.id
  key           = "auth-config.json"
  content       = jsonencode(local.auth_config)
  content_type  = "application/json; charset=utf-8"
  cache_control = "public, max-age=0, must-revalidate"

  tags = { Name = "${local.name}-site" }
}
