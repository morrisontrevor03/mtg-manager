# Postgres

**This migration is done.** `prisma/schema.prisma` targets `postgresql`, and the
SQLite-dialect migration history has been replaced by a single Postgres
`20261002000000_init_postgres` migration. The old SQLite migrations are kept at
`prisma/_sqlite-migrations.bak/` and can be deleted.

This page now covers running Postgres locally. For the deployed database (RDS in
a private VPC) see [`infra/README.md`](../infra/README.md).

## Local development

The app no longer works against a `file:./dev.db` URL. Start a throwaway Postgres:

```bash
docker run --name mtg-pg -e POSTGRES_PASSWORD=mtg -e POSTGRES_DB=mtg \
  -p 5432:5432 -d postgres:16
```

Point `.env` at it and create the schema:

```
DATABASE_URL="postgresql://postgres:mtg@localhost:5432/mtg"
```

```bash
npx prisma migrate deploy
npm run dev
```

The old `prisma/dev.db` is still on disk but nothing reads it. Its contents were
not carried over.

## What changed in the move

- `datasource db` provider is `postgresql`.
- The `generator client` block declares `binaryTargets` for the Lambda runtime
  (`linux-arm64-openssl-3.0.x`, `rhel-openssl-3.0.x`) alongside `native`.
- `Json` columns became real `jsonb`. No code change was needed.
- Postgres `contains` is case-sensitive where SQLite's was not, so the collection
  search in `src/app/api/collection/route.ts` now passes
  `mode: "insensitive"` explicitly.

## Adding a migration

Author it against local Postgres, then let the in-VPC runner apply it to RDS:

```bash
npx prisma migrate dev --name add_something
npm run lambda:build      # bundles prisma/migrations into the Lambda package
cd infra && terraform apply
```

RDS has no public endpoint, so `prisma migrate deploy` from a laptop cannot reach
it. See [`infra/README.md`](../infra/README.md#migrations) for why, and for the
manual invocation if you would rather not apply migrations on every
`terraform apply`.

## Pooled providers

If you ever swap RDS for a pooled serverless Postgres (Neon, Supabase, PgBouncer),
add a `directUrl` for migrations:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Keep `DATABASE_URL` pooled with `?pgbouncer=true&connection_limit=1` and
`DIRECT_URL` unpooled. That setup would also let the Lambda leave the VPC, which
removes the NAT gateway — the largest item on the AWS bill.
