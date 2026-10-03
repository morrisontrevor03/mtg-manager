# Accounts

Anyone can create an account with an email and password, or with Google. Each
account has its own private collection and decks.

## How it fits together

```
browser ── Amplify Auth ──> Cognito user pool          (sign up, sign in, reset)
   │                           └── Google (OAuth redirect via the pool's domain)
   │
   └── /api/* + Bearer token ──> CloudFront ──> API Gateway ──> Lambda ──> RDS
                                                 └ JWT authorizer verifies the
                                                   token before the Lambda runs
```

- **Cognito** ([`infra/auth.tf`](../infra/auth.tf)) owns accounts and passwords.
  The app never sees a password: sign-in uses SRP, and the pool enforces at
  least 10 characters with a lowercase letter and a number.
- **The pages** (`/login`, `/signup`, `/forgot-password`, `/auth/callback`) are
  the app's own, in its design. They call Cognito through `aws-amplify/auth`.
- **API Gateway** checks every `/api/*` request's access token (signature,
  expiry, issuer, client) before invoking the Lambda. Only `/api/health` is open.
- **The Lambda** passes the verified user id (`sub`) to the route handlers in
  the `x-mtg-user-id` header, after deleting any copy the caller sent.
- **Every query** filters on that id. `CollectionItem.userId` and `Deck.userId`
  hold it; another account's rows read as "not found". There is no User table:
  Cognito is the source of truth for who exists.
- **The frontend gets the pool ids at runtime** from `/auth-config.json`, which
  Terraform uploads, because the site is built before Terraform creates the pool.

## Turning on "Sign in with Google"

Email and password works as soon as this is deployed. The Google button appears
once a Google OAuth client is configured.

1. Get the redirect URI Google will need:

   ```bash
   cd infra && terraform output -raw google_redirect_uri
   ```

   It looks like `https://mtg-manager-dev-<account>.auth.us-west-1.amazoncognito.com/oauth2/idpresponse`.

2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - **OAuth consent screen**: set it up as *External*, add your app name and
     support email, and the `openid`, `email` and `profile` scopes. While it is
     in *Testing*, only test users you list can sign in; *publish* it for
     everyone. These scopes need no Google review.
   - **Credentials → Create credentials → OAuth client ID**, type *Web
     application*. Under *Authorized redirect URIs*, paste the URI from step 1.

3. Put the client id in [`infra/dev.tfvars`](../infra/dev.tfvars) (it is public)
   and the client secret in the `GOOGLE_CLIENT_SECRET` GitHub repository secret.
   For local Terraform runs, add `google_client_secret = "…"` to
   `infra/terraform.tfvars`.

4. Merge and deploy. Terraform adds Google to the user pool, and
   `/auth-config.json` flips `googleEnabled` to `true`.

## Local development

`next dev` talks to the deployed user pool, so local sign-ups are real accounts
in the same pool.

```bash
npm run auth:config   # writes public/auth-config.json from `terraform output`
npm run dev
```

The API routes verify tokens themselves under `next dev`, since there is no API
Gateway in front of them, using the same `public/auth-config.json`.
`http://localhost:3000` is registered as an allowed Google redirect
(`local_dev_origin` in Terraform).

## Limits and follow-ups

- **Email: 50 a day.** Verification and reset codes go through Cognito's
  built-in sender, which AWS caps at 50 emails a day. If sign-ups outgrow that,
  move to SES (`email_configuration` in `auth.tf`).
- **Google and password accounts are separate.** Someone who signs up with a
  password and later uses "Continue with Google" with the same email gets a
  second, empty account. Linking them needs a Cognito pre-sign-up Lambda trigger
  calling `AdminLinkProviderForUser`.
- **The user pool has deletion protection on.** `terraform destroy` refuses
  until `deletion_protection` is set to `INACTIVE`, because losing the pool
  orphans every user's data.
- **Signing up is open to anyone.** API Gateway throttling (50 rps) is the only
  rate limit beyond Cognito's own. Revisit before re-enabling the LLM deck
  builder, which spends money per request.
