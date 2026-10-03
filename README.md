# MTG Manager

A personal Magic: The Gathering collection manager with a dashboard and an
LLM-powered deck builder (Standard + Commander).

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Prisma** on **Postgres** (see [`docs/postgres-migration.md`](docs/postgres-migration.md))
- **AWS deployment** via Terraform — static frontend on S3 + CloudFront, API on
  Lambda behind API Gateway, RDS Postgres in a private VPC
  (see [`infra/README.md`](infra/README.md))
- **Scryfall** for card metadata, prices and images
- **Anthropic Claude** (`claude-opus-5`) for deck generation, with server-side
  format-rule validation

## Setup

```bash
npm install
docker run --name mtg-pg -e POSTGRES_PASSWORD=mtg -e POSTGRES_DB=mtg   -p 5432:5432 -d postgres:16
cp .env.example .env        # then edit .env
npx prisma migrate deploy   # creates the schema
npm run dev                 # http://localhost:3000
```

`.env` keys:

| key | purpose |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:mtg@localhost:5432/mtg` for local Docker |
| `ANTHROPIC_API_KEY` | required for the deck builder only |
| `SCRYFALL_UA` | descriptive User-Agent sent to Scryfall |

## Features

### Collection
- **Add a card** — name autocomplete via Scryfall, quantity, foil.
- **Import a list** — paste or upload a single-column list of names. `2x` / `2 `
  quantity prefixes, quoted names, and Arena-style `(SET) 123` suffixes are
  handled. Unmatched names are reported back. Try `sample-collection.csv`.
- **Voice entry** (`/collection/voice`) — see below.
- Inline quantity edit / remove.

### Voice entry
Announce cards one at a time and watch each become a full record. Say
*"four Lightning Bolt"* or *"foil Sol Ring"*; the card is matched, enriched from
Scryfall, and added, then it listens for the next one.

- **Matching** is fuzzy and phonetic, against all ~35k Magic card names. It is
  built for how speech recognisers actually fail — splitting compounds
  (*"counter spell"* → Counterspell) and substituting homophones
  (*"shell dread"* → Sheoldred). Confident matches (≥0.90) are added
  automatically; uncertain ones (0.62–0.90) offer the top 3; anything lower is
  queued as unresolved with a text box to correct it, so the loop never blocks.
- **Enrichment is visible**: each row moves through transcript → match →
  skeleton → finished card with art, mana cost, type, set, rarity, and price.
  Rows enrich independently, so you can keep talking.
- **Voice commands**: `one`/`two`/`three` to pick a suggestion, `undo` to reverse
  the last card, `skip`, `stop`.
- Needs the Web Speech API — **Chrome, Edge, or Safari**. Firefox shows a notice
  pointing at the manual form and list import.
- The card-name catalogue is cached in the DB for a week (`CatalogCache`), so
  only the first match after a cold start pays for the download.

### Dashboard
Collection size, Scryfall value, colour / type / rarity breakdown, mana curve,
top sets, recent additions, deck counts.

### Deck builder
Pick Standard or Commander, describe the deck, optionally choose an owned
legendary as commander, and allow or forbid acquisition suggestions (with an
optional budget). The model builds a list preferring your collection; the server
then validates it against format rules (60/100 counts, singleton, 4-of, colour
identity, legality) and retries once on failure. Each card is flagged **owned**
or **acquire**. Decks can be renamed, marked final, copied as text, or deleted.

## Scripts

| script | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `npm start` | production build |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:studio` | Prisma Studio |
| `npm run lambda:build` | stage the AWS Lambda deployment package |
| `npm run lambda:check` | verify the route list matches the Terraform one |
| `npm run build:static` | build the static frontend into `out/` for S3 |

## Layout

```
src/
  app/
    page.tsx                 dashboard (client, fetches /api/dashboard)
    collection/              collection UI
    decks/, decks/new/, decks/view/
    api/**/route.api.ts      route handlers (Lambda in prod, next dev locally)
  lib/
    useApi.ts                client-side fetch hook for the static frontend
    db.ts                    Prisma singleton
    scryfall.ts              Scryfall client (rate-limited)
    csv.ts                   card-list parser
    textMatch.ts             fuzzy/phonetic scoring (pure, unit-tested)
    cardIndex.ts             card-name catalogue cache + matcher
    voiceParse.ts            transcript → quantity/foil/command (pure, tested)
    beep.ts                  Web Audio feedback tones
    deckRules.ts             format validation (pure, unit-tested)
    claude.ts                Anthropic call + structured output schema
    deckBuilder.ts           build → resolve → validate → persist
    aggregate.ts             dashboard queries
    collection.ts, deck.ts   shared read/serialise helpers
  types/speech.d.ts          Web Speech API declarations missing from lib.dom
lambda/
  src/handler.ts             API Gateway event <-> Request/Response adapter
  src/routes.ts              route key -> existing App Router handler
  src/routeKeys.ts           the API surface, mirrored in Terraform
  src/match.ts               route matching (pure, unit-tested)
  src/migrate.ts             applies Prisma migrations from inside the VPC
  src/sqlSplit.ts            SQL statement splitter (pure, unit-tested)
  build.mjs                  esbuild bundle + Prisma engine staging
  check-routes.mjs           code/Terraform route drift check
scripts/build-static.mjs     static frontend build (sets STATIC_EXPORT)
infra/                       Terraform: VPC, RDS, Lambda, API Gateway, S3, CloudFront
prisma/schema.prisma
docs/postgres-migration.md
```

## Deploying to AWS

One CloudFront distribution serves the static frontend from S3 and proxies
`/api/*` to an API Gateway in front of Lambda, with RDS Postgres in a private VPC
— about $15/month. The Lambda imports the same route handlers Next serves, so
there is no second copy of the backend, and there is no NAT gateway (egress is
IPv6 through a free egress-only gateway).

```bash
npm run lambda:build     # the API, for Lambda
npm run build:static     # the frontend, into out/
cd infra && terraform init && terraform apply
terraform output -raw site_url
```

See [`infra/README.md`](infra/README.md) for the runbook, cost breakdown, and two
caveats worth knowing: the LLM deck builder ships disabled (API Gateway's
29-second ceiling), and the API is unauthenticated unless you set
`api_shared_secret`.

### Notes on the static build

- API route handlers are named `route.api.ts`. `next.config.ts` drops `api.ts`
  from `pageExtensions` during the export build so Next ignores them — route
  handlers cannot be statically exported, and on AWS they run on Lambda. `next
  dev` still serves them locally.
- Pages are client components that fetch from `/api/*` via `src/lib/useApi.ts`.
- Deck detail is `/decks/view?id=…`, not `/decks/[id]` — a static export cannot
  pre-render a dynamic segment whose ids are cuids.
