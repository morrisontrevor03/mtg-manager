# Backend on API Gateway + Lambda

Terraform for the MTG Manager backend: the `/api/*` route handlers running as an
AWS Lambda function behind an API Gateway HTTP API, against a private RDS
Postgres instance.

## What gets created

| Resource | Purpose |
| --- | --- |
| VPC, 2 public + 2 private subnets | Two AZs, the minimum an RDS subnet group accepts |
| Egress-only internet gateway | Free outbound IPv6 so the VPC-attached Lambda can reach Scryfall and Anthropic without a NAT gateway |
| Internet gateway | Unused by this stack; kept for a future bastion or ALB (free) |
| Security groups | RDS accepts 5432 only from the Lambda security group; no CIDR rules, no public endpoint |
| RDS Postgres (`db.t4g.micro`, gp3, encrypted) | The database |
| Secrets Manager secret | The assembled connection URL and credentials |
| Lambda `…-api` | All `/api/*` routes |
| Lambda `…-migrate` | Applies Prisma migrations from inside the VPC |
| API Gateway HTTP API + `$default` stage | One explicit route per endpoint, access logs, throttling |
| CloudWatch log groups | Lambda and gateway logs, retention from `log_retention_days` |
| S3 bucket (private, encrypted) | The exported frontend; readable only by CloudFront via an origin access control |
| CloudFront distribution | Serves the site and proxies `/api/*` to the gateway on the same domain |
| CloudFront function | Maps directory-style URIs onto the exported `index.html` files |

## How the Lambda relates to the Next.js app

There is no second copy of the backend. [`lambda/src/routes.ts`](../lambda/src/routes.ts)
imports the same handlers that `next dev` serves out of `src/app/api/**`, and
[`lambda/src/handler.ts`](../lambda/src/handler.ts) is pure translation: API
Gateway event to `Request`, existing handler, `Response` back to an API Gateway
result.

Two small changes made that possible:

- `src/lib/http.ts` now returns a standard `Response` instead of a
  `NextResponse`, so the handlers no longer import `next/server`. Next accepts a
  plain `Response` from a route handler, so local development is unaffected.
- `prisma/schema.prisma` moved from `sqlite` to `postgresql` and declares
  `binaryTargets` for the Lambda runtime.

The route list lives in [`lambda/src/routeKeys.ts`](../lambda/src/routeKeys.ts)
and is mirrored in `apigateway.tf`. `npm run lambda:check` fails if the two
drift, which is otherwise a mistake you only discover in a deployed environment.

## Deploy

Normally a merge to `main` deploys through the CI/CD pipeline. See
[`docs/ci-cd.md`](../docs/ci-cd.md), including the one-time move to S3 state.
The manual path below still works. Once state is in S3, pass
`-backend-config="bucket=…"` to `terraform init` and `-var-file=dev.tfvars` to
`plan`/`apply`.

```bash
# 1. From mtg-manager/ - build both halves.
npm run lambda:build        # add -- --arch=x86_64 if you change lambda_architecture
npm run lambda:check        # routeKeys.ts vs apigateway.tf
npm run build:static        # the frontend, into out/

# 2. Configure.
cd infra
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars - set api_shared_secret at minimum

# 3. Apply. First apply takes ~10 minutes, almost all of it RDS.
terraform init
terraform plan
terraform apply

# 4. Verify end to end.
curl "$(terraform output -raw health_check_url)" -H "x-api-key: YOUR_SECRET"
# => {"ok":true,"database":"up"}

# 5. Open the site. No key needed - CloudFront adds it for you.
terraform output -raw site_url
```

`terraform apply` invokes the migration Lambda automatically, so the schema is
live when it finishes. Re-running the API build and `terraform apply` is the
normal way to ship a code change: `source_code_hash` picks it up.

## Migrations

`prisma migrate deploy` cannot reach RDS from your laptop - the instance has no
public endpoint, which is the point. Instead, migrations are applied by a Lambda
inside the VPC.

```bash
# After adding a migration locally:
npx prisma migrate dev --name add_something   # against local Postgres
npm run lambda:build                          # bundles prisma/migrations into the package
cd infra && terraform apply                   # re-invokes the migrate function
```

The runner in [`lambda/src/migrate.ts`](../lambda/src/migrate.ts) writes to
Prisma's own `_prisma_migrations` ledger with the same checksums the CLI
computes, so it is idempotent and stays consistent with a future
`prisma migrate deploy` run through a bastion.

To apply migrations by hand instead, set `run_migrations_on_apply = false` and:

```bash
aws lambda invoke --function-name "$(terraform output -raw migrate_function_name)" \
  --cli-binary-format raw-in-base64-out --payload '{}' /dev/stdout
```

## The frontend

One CloudFront distribution serves both halves: the static site from S3, and
`/api/*` from the existing API Gateway. That is deliberate, and it buys two
things.

**No CORS.** The browser code calls relative paths (`fetch("/api/collection")`),
and because both come from the same domain those stay same-origin — no preflight,
and `cors_allowed_origins` stays empty. Set that variable only if you ever serve
the frontend from a different domain.

**Somewhere to keep the shared secret.** A static site cannot hold a credential;
anything in its JavaScript is public. So CloudFront attaches `x-api-key` to
requests on their way to the API origin, as an origin custom header. The browser
never sees it, CloudFront overrides any same-named header a viewer tries to send,
and the API Gateway URL stays protected against direct callers.

### Caching

`_next/static/*` filenames carry a content hash, so those objects are uploaded
with `max-age=31536000, immutable`. HTML gets `max-age=0, must-revalidate`, which
means **a deploy is live as soon as the upload finishes — no invalidation step**.
`terraform output cloudfront_distribution_id` is there if you ever want to create
one by hand.

`/api/*` uses the managed CachingDisabled policy. These are per-request responses
and some are writes; caching them would be wrong.

The frontend is a static export in `out/`, built by `npm run build:static`, which
Terraform uploads to S3 as individual objects. Three details make it work:

- **Every page is a client component now.** They used to be async server
  components querying Prisma directly, which cannot be statically exported. Each
  one fetches from `/api/*` through the `useApi` hook in `src/lib/useApi.ts`.
- **`/decks/[id]` became `/decks/view?id=…`.** A static export cannot pre-render a
  dynamic segment without `generateStaticParams`, and deck ids are cuids that
  cannot be enumerated at build time.
- **The API route handlers are named `route.api.ts`.** `next.config.ts` leaves
  `api.ts` out of `pageExtensions` during the export build, which hides them from
  `next build` — route handlers cannot be exported, and in production they run on
  Lambda instead. `next dev` still serves them locally.

## Two things to know before you rely on this

**The deck builder is disabled.** `POST /api/decks/build` returns 503 while
`enable_deck_builder = false` (the default). API Gateway caps every integration
at 29 seconds and that route is declared `maxDuration = 300`, so a real LLM build
would return 504 to the client even though the Lambda kept working. Re-enabling
the flag turns the route back on but does not raise the ceiling; the durable fix
is an async job - `POST` returns `202 {jobId}`, a worker Lambda does the work, and
the client polls a status endpoint. `POST /api/collection/import` carries the same
`maxDuration = 300` declaration and the same exposure on a large CSV, but it stays
enabled because a small import finishes well inside the limit.

**Callers are authenticated twice.** Every application route requires a Cognito
access token, which API Gateway's JWT authorizer verifies before the Lambda runs,
and each user only ever sees their own collection and decks (see
[`auth.tf`](auth.tf) and [`docs/accounts.md`](../docs/accounts.md)). Separately,
`api_shared_secret` makes the gateway reject any request that did not come through
CloudFront. Keep it set: `/api/health` has no token check, and the secret is what
keeps the raw gateway URL from being an open door. The pipeline refuses to deploy
with it empty.

## Cost

Rough monthly figures for a single user in `us-east-1`:

| Item | Cost |
| --- | --- |
| RDS `db.t4g.micro`, 20GB gp3, 7-day backups | ~$13-15 |
| Egress-only internet gateway, VPC, subnets, IGW | $0 |
| Lambda, API Gateway, CloudWatch, Secrets Manager | under $1 at this volume |
| Cognito (Lite tier) | $0 up to 10,000 monthly active users |
| S3 (2MB) + CloudFront (`PriceClass_100`) | under $1 at this volume |
| **Total** | **~$15-16/month** |

There is no NAT gateway, which is normally the largest line in a design like this
(~$32/month in hourly charges before any data processing). See below for how that
is avoided. RDS is now the whole bill; `db_instance_class` is the lever if it
needs to come down further.

## Egress without a NAT gateway

A Lambda attached to a VPC has no route to the internet by itself, and the backend
needs two public APIs: `api.scryfall.com` for card data and `api.anthropic.com`
for the deck builder. The standard answer is a NAT gateway, which bills ~$32/month
in hourly charges before any data processing.

This stack uses an **egress-only internet gateway** instead. It is the IPv6
counterpart of a NAT gateway - outbound connections allowed, inbound blocked - and
AWS charges nothing for it. Three pieces make it work:

1. The VPC and the private subnets get IPv6 CIDRs, and the private subnets set
   `assign_ipv6_address_on_creation`.
2. The private route table sends `::/0` to the egress-only gateway. There is
   deliberately **no** `0.0.0.0/0` route, so the private subnets have no IPv4 path
   off the VPC at all.
3. Both Lambda functions set `ipv6_allowed_for_dual_stack = true`, which is what
   gives their ENIs an IPv6 address.

The functions also run with `NODE_OPTIONS=--dns-result-order=ipv6first`. Node is
otherwise free to try an A record first, which would sit in a connect timeout
before falling back to AAAA.

RDS is untouched by any of this. The Lambda reaches it over IPv4 on a private
address inside the VPC, which is local routing and needs no gateway.

### The dependency this creates

Outbound traffic only works for destinations that publish AAAA records. Both do
today:

```
api.scryfall.com    2606:4700:10::6814:238e   (Cloudflare)
api.anthropic.com   2607:6bc0::10
```

If either ever drops IPv6, every call to it fails with a network error and the
affected routes break. Two fallbacks, in order of cost:

- **A NAT instance.** A `t4g.nano` running an off-the-shelf NAT AMI restores IPv4
  egress for ~$3-4/month instead of ~$32. It is a single point of failure you
  patch yourself, which is a reasonable trade for one user.
- **A NAT gateway.** Add `aws_nat_gateway` plus an EIP in a public subnet (the
  public subnets and internet gateway are already here) and restore the
  `0.0.0.0/0` route on the private route table.

`cards.scryfall.io`, which has no public AAAA record, is only ever fetched by the
browser for card images - never by the Lambda - so it is unaffected.

## Teardown

```bash
terraform destroy
```

With `db_deletion_protection = true` this refuses until you flip it back to
`false`, and it takes a final snapshot before deleting the instance.

## Notes

- **Terraform state contains secrets.** The generated RDS password and the
  assembled `DATABASE_URL` are both in state. Move to the encrypted S3 backend
  commented out at the top of `versions.tf` before sharing a working directory.
- **The connection URL reaches the Lambda as an environment variable**
  (KMS-encrypted at rest), not fetched from Secrets Manager at runtime. That
  keeps `src/lib/db.ts` constructing `PrismaClient` synchronously at module load,
  identically under Next and Lambda, and avoids a secret fetch on every cold
  start. The secret exists so you can retrieve or rotate the URL; rotating it
  means re-running `terraform apply` to update the function.
- **`connection_limit=1` is in the URL on purpose.** Every warm Lambda instance
  owns its own Prisma pool, so Prisma's default pool size would multiply by
  concurrency and exhaust `db.t4g.micro`'s ~110 connections.
  `lambda_reserved_concurrency` bounds the other side of that arithmetic. It
  defaults to `-1` (no reservation) because AWS requires 10 executions to stay
  unreserved and a new account's *total* limit is 10, so any reservation is
  rejected — on such an account the limit is itself the bound. Once you raise the
  quota (Service Quotas -> Lambda -> Concurrent executions), set a real number; if
  you raise it a lot, put an RDS Proxy in front instead.
- **Cold starts** run about 1.5-3 seconds: VPC ENI attachment plus loading
  Prisma's 15MB query engine. Dual-stack networking does not add to this. `lambda_memory_mb = 1024` buys enough CPU to keep
  that tolerable. Provisioned concurrency would remove it, at a price that is
  hard to justify for one user.
