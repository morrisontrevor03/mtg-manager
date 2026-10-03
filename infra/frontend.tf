# The statically exported Next.js frontend: a private S3 bucket behind CloudFront,
# with `/api/*` routed to the existing API Gateway on the same domain.
#
# Serving both from one distribution is what keeps the browser code unchanged:
# its `fetch("/api/collection")` calls stay same-origin, so no CORS preflight
# happens and `cors_allowed_origins` can stay empty.
#
# It is also what makes the shared secret workable. A static site cannot hold a
# credential — anything in its JS is public — so CloudFront attaches `x-api-key`
# to requests as they leave for the API origin. The browser never sees it, and the
# API Gateway URL stays protected against direct callers.

locals {
  site_dir = "${path.module}/../out"

  # Next writes everything under `_next/static` with a content hash in the name,
  # so those can be cached forever. HTML must not be, or a deploy would not be
  # visible until the cache expired. Revalidating HTML on every request also
  # removes any need to create an invalidation after an upload.
  immutable_prefix = "_next/static/"

  mime = {
    html        = "text/html; charset=utf-8"
    css         = "text/css; charset=utf-8"
    js          = "text/javascript; charset=utf-8"
    mjs         = "text/javascript; charset=utf-8"
    json        = "application/json; charset=utf-8"
    map         = "application/json; charset=utf-8"
    svg         = "image/svg+xml"
    png         = "image/png"
    jpg         = "image/jpeg"
    jpeg        = "image/jpeg"
    gif         = "image/gif"
    webp        = "image/webp"
    avif        = "image/avif"
    ico         = "image/x-icon"
    woff        = "font/woff"
    woff2       = "font/woff2"
    ttf         = "font/ttf"
    txt         = "text/plain; charset=utf-8"
    xml         = "application/xml"
    webmanifest = "application/manifest+json"
  }

  site_files = fileset(local.site_dir, "**")
}

# --- Bucket ---------------------------------------------------------------

resource "aws_s3_bucket" "site" {
  bucket        = "${local.name}-site-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # the contents are build output, reproducible from source

  tags = { Name = "${local.name}-site" }
}

data "aws_caller_identity" "current" {}

# No public access of any kind: CloudFront reaches the bucket through an origin
# access control, and nothing else can read it.
resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "site" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    # Scoped to this distribution, so another account's CloudFront cannot read it.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json
}

# --- Content --------------------------------------------------------------

resource "aws_s3_object" "site" {
  for_each = local.site_files

  bucket = aws_s3_bucket.site.id
  key    = each.value
  source = "${local.site_dir}/${each.value}"

  # Terraform re-uploads only what actually changed between builds.
  etag = filemd5("${local.site_dir}/${each.value}")

  content_type = lookup(
    local.mime,
    lower(try(regex("[^.]+$", each.value), "")),
    "application/octet-stream",
  )

  cache_control = startswith(each.value, local.immutable_prefix) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate"

  tags = { Name = "${local.name}-site" }
}

# --- URI rewriting --------------------------------------------------------

# S3 as a REST origin does not resolve directory indexes, so `/decks/` would 404
# even though `decks/index.html` exists. This maps a directory-style request onto
# the file the export actually wrote. Attached only to the static behaviour, never
# to `/api/*`.
resource "aws_cloudfront_function" "rewrite_index" {
  name    = "${local.name}-rewrite-index"
  runtime = "cloudfront-js-2.0"
  comment = "Map directory-style URIs onto the exported index.html files"
  publish = true

  code = <<-JS
    function handler(event) {
      var request = event.request;
      var uri = request.uri;

      if (uri.endsWith("/")) {
        request.uri = uri + "index.html";
      } else if (!uri.split("/").pop().includes(".")) {
        // Extensionless path: `/decks` -> `/decks/index.html`.
        request.uri = uri + "/index.html";
      }

      return request;
    }
  JS
}

# --- Distribution ---------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.name}-site-oac"
  description                       = "CloudFront to the MTG Manager site bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# AWS-managed policies, referenced by name rather than hardcoded id.
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "${local.name} frontend"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  is_ipv6_enabled     = true

  # --- Origins ---

  origin {
    origin_id                = "s3-site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = "api-gateway"
    domain_name = replace(aws_apigatewayv2_api.main.api_endpoint, "https://", "")

    custom_origin_config {
      origin_protocol_policy = "https-only"
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # The credential the browser must never hold. CloudFront overrides any
    # same-named header a viewer sends, so it cannot be spoofed from outside.
    dynamic "custom_header" {
      for_each = var.api_shared_secret != "" ? [1] : []

      content {
        name  = "x-api-key"
        value = var.api_shared_secret
      }
    }
  }

  # --- Behaviours ---

  default_cache_behavior {
    target_origin_id       = "s3-site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite_index.arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "api-gateway"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Never cache the API: these responses are per-request and some are writes.
    cache_policy_id = data.aws_cloudfront_cache_policy.disabled.id

    # Forwards query strings, cookies and headers but drops Host, so API Gateway
    # still sees its own hostname and routes correctly.
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # The export writes 404.html; serve it for anything the bucket does not have.
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  viewer_certificate {
    # The default *.cloudfront.net certificate. A custom domain would need an
    # ACM certificate in us-east-1 plus an aliases entry.
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/../out/index.html")
      error_message = "Static frontend missing. Run `npm run build:static` in mtg-manager/ before applying."
    }
  }

  tags = { Name = "${local.name}-site" }
}
