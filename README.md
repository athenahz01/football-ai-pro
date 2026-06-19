# Football AI Pro

Public football analytics app scaffold built with Next.js App Router, TypeScript, ESLint, Prettier, and a source-agnostic football data provider layer.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and replace every placeholder with a real value.

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run build
npm run lint
npm run typecheck
npm run format
```

## Database And ETL

The structured stats schema lives in `supabase/migrations`. Apply it to a Supabase Postgres database before running the loader.

Run the loader once:

```bash
npm run etl
```

List available neutral competition ids:

```bash
npm run etl:competitions
```

To load a subset, set `ETL_COMPETITION_IDS` in `.env.local` to a comma separated list of ids from `npm run etl:competitions`. Leave it blank to load everything.

Run the loader twice and compare final table counts:

```bash
npm run etl:verify
```

The ETL reads through `getProvider()` only, writes with idempotent upserts, and prints row counts for `competitions`, `teams`, `players`, `player_teams`, `matches`, and `match_events`.

## Environment

`lib/config/env.ts` validates required environment variables with zod and exports a typed `config` object.

Required keys:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `DATA_PROVIDER`, one of `statsbomb_open` or `api_football`

The Supabase service client is server-only and used by the ETL. No LLM clients are wired in this cluster.

## Data Providers

All football data access goes through `StatsProvider` in `lib/providers/types.ts`. Application code should import `getProvider()` from `lib/providers` and depend only on neutral types such as `Competition`, `Match`, `Team`, `Player`, and `MatchEvent`.

The current implementation is `StatsBombOpenDataProvider`, which reads official StatsBomb Open Data JSON from GitHub for non-commercial prototyping only.

To add a new provider:

1. Create a provider class in `lib/providers/` that implements `StatsProvider`.
2. Map the source response into the neutral return types inside that provider file.
3. Register the provider in `lib/providers/index.ts`.
4. Set `DATA_PROVIDER` to the new provider id.

No code outside provider implementations should depend on source-specific response shapes.
