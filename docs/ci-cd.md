# CI/CD

GitHub Actions, defined in [`.github/workflows/pipeline.yml`](../.github/workflows/pipeline.yml).

```
pull request   check ─┐
               migrations ─┤
               terraform ──┼─> plan                       (plan shown in the run summary)
               build ──────┘

push to main   ...same...  ─> plan ─> [you approve] ─> deploy ─> smoke test
```

| Job | What it catches |
| --- | --- |
| **check** | `lint`, `typecheck`, Vitest, and `lambda:check` (routes in code vs `apigateway.tf`) |
| **migrations** | Applies every migration to a fresh Postgres 16, then `prisma migrate diff --exit-code` fails if `schema.prisma` changed without a migration |
| **terraform** | `fmt -check` and `validate` for `infra/` and `infra/bootstrap/` |
| **build** | `lambda:build` (arm64) and `build:static`, uploaded as artifacts |
| **plan** | `terraform plan` against the real stack, read-only AWS role, built from those exact artifacts |
| **deploy** | `terraform apply` (uploads Lambda + frontend, runs migrations), then hits `/api/health` through CloudFront |

AWS access is through GitHub's OIDC provider; no AWS keys are stored in GitHub.
The plan role is read-only and cannot write state. The apply role can only be
assumed by a job in the `production` environment.

## One-time setup

Order matters: state has to be in S3 before CI can see it.

### 1. Put the code on GitHub

From `mtg-manager/` (this directory is the repository root):

```bash
git init -b main
git add .
git status          # confirm no .env, terraform.tfvars, or *.tfstate is staged
git commit -m "Initial commit"
gh repo create mtg-manager --private --source . --push
```

### 2. Bootstrap the state bucket and CI roles

```bash
cd infra/bootstrap
terraform init
terraform apply      # reads the committed terraform.tfvars
```

The roles trust GitHub's OIDC subject in its id-pinned form,
`repo:OWNER@OWNER_ID/REPO@REPO_ID:…`, so `terraform.tfvars` here holds the
numeric owner and repository ids as well as the names. Both are public. If AWS
ever rejects the token with `Not authorized to perform
sts:AssumeRoleWithWebIdentity`, CloudTrail records the subject GitHub actually
sent:

```bash
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity \
  --max-results 1 --query 'Events[0].CloudTrailEvent' --output text
```

If the apply fails with `EntityAlreadyExists` on the OIDC provider, your account
already has one. Re-run with `-var create_github_oidc_provider=false`.

Keep the three outputs; steps 3 and 5 need them.

### 3. Move the main stack's state into S3

```bash
cd ../            # infra/
terraform init -migrate-state \
  -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)"
# Answer "yes" to copy the existing state.

terraform plan -var-file=dev.tfvars
```

The plan should only show the Lambda package and site files, or nothing at
all. **If it wants to replace the RDS instance or anything in the VPC, stop.**
Something didn't migrate correctly. Your local `terraform.tfstate` is still on
disk, untouched.

Once the plan looks right, delete the local copies. They hold the database
password, and this folder syncs to OneDrive:

```bash
rm terraform.tfstate terraform.tfstate.backup
```

S3 versioning keeps every prior state version for 90 days.

### 4. Trim `terraform.tfvars` to secrets only

Non-secret settings now live in the committed [`infra/dev.tfvars`](../infra/dev.tfvars).
Leave only `api_shared_secret` (and `anthropic_api_key` if set) in
`terraform.tfvars`. Terraform still loads that file automatically on local runs.

### 5. Configure the GitHub repository

**Settings → Environments → New environment → `production`**

- *Required reviewers*: add yourself. This is what makes deploys wait for you.
- *Deployment branches*: `main` only.

**Settings → Secrets and variables → Actions**

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `API_SHARED_SECRET` | the value from `terraform.tfvars` |
| Secret | `ANTHROPIC_API_KEY` | optional; only used if the deck builder is enabled |
| Secret | `GOOGLE_CLIENT_SECRET` | optional; enables Google sign-in, see [accounts.md](accounts.md) |
| Variable | `AWS_REGION` | `us-west-1` |
| Variable | `TF_STATE_BUCKET` | bootstrap output `state_bucket` |
| Variable | `AWS_PLAN_ROLE_ARN` | bootstrap output `plan_role_arn` |
| Variable | `AWS_APPLY_ROLE_ARN` | bootstrap output `apply_role_arn` |

Add these as **repository** secrets and variables, not environment ones. The plan
job needs them too, and it runs outside the `production` environment.

**Settings → Branches → Add rule for `main`** (recommended): require the
`check`, `migrations`, `terraform`, `build`, and `plan` checks to pass before
merging.

> **Private repo on the free GitHub plan?** GitHub only enforces required
> reviewers on private repositories with Pro, Team, or Enterprise. Without one,
> the `production` environment still works and still gates the AWS role, but
> deploys run automatically on every push to `main`. To keep a manual gate
> without paying, change the `deploy` job's `if:` to
> `github.event_name == 'workflow_dispatch'` and trigger deploys from the
> Actions tab.

## Day to day

- **Open a PR.** CI runs, and the plan job shows exactly what would change in
  AWS. Check the run summary before merging.
- **Merge.** The pipeline re-runs on `main`, then pauses at *deploy* until you
  approve it under Actions → the run → *Review deployments*.
- **Schema change.** Run `npx prisma migrate dev --name …` locally and commit
  the migration. The migrations job fails if you forget. The deploy applies it.
- **Every plan shows changes.** Next.js stamps a fresh build id into the HTML,
  and a Linux-built zip hashes differently from a Windows-built one. Expect
  Lambda and site-object updates on every run; look closely at anything else.

## Running Terraform locally

It still works, against the same S3 state:

```bash
cd infra
terraform init -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)"
npm --prefix .. run lambda:build && npm --prefix .. run build:static
terraform plan -var-file=dev.tfvars
```

Pipeline deploys and local applies share the S3 lockfile, so two applies can't
run at once.
