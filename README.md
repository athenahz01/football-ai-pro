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

The Supabase service client is server-only and used by the ETL. The service role key and `SUPABASE_DB_URL` are never exposed to the browser.

## Authentication

Authentication uses Supabase Auth with email and password through the `@supabase/ssr` package.

- `lib/supabase/server-client.ts` is the server side client. It reads the session from cookies and uses the anon key from the validated config. Server code calls `getAuthenticatedUser()` to learn who is signed in.
- `lib/supabase/browser-client.ts` is the browser client. It uses only the public anon key.
- `middleware.ts` refreshes the session cookie on each request.

Flows:

- `/auth` is a sign in and sign up page. After signing in you return to `/ask`.
- The `/ask` page shows the signed in email and a sign out control, or a sign in link when anonymous.
- The product stays usable signed out. Anonymous users are rate limited per IP, signed in users per user id with a higher limit.

Browser env keys, both safe to expose and equal to the server values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Rate limit keys, all optional with defaults:

- `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY` for anonymous IP traffic
- `RATE_LIMIT_USER_PER_MINUTE`, `RATE_LIMIT_USER_PER_DAY` for signed in users
- `RATE_LIMIT_PREMIUM_PER_MINUTE`, `RATE_LIMIT_PREMIUM_PER_DAY` for premium users

## Billing Foundation

Phase 3 adds a Stripe test-mode subscription foundation. It does not paywall any existing feature. Premium currently proves the entitlement path by raising the signed-in rate limit only.

- `user_subscriptions` stores the Supabase auth user id, tier, Stripe customer id, Stripe subscription id, status, and current period end. No row means free.
- Checkout and customer portal routes use the current server session user only. They never accept a user id from request input.
- Stripe webhooks verify the Stripe signature, map the event through the stored Stripe customer id, and update the subscription row through the trusted parameterized write path.
- Secrets stay server only. The browser only receives the checkout or portal redirect URL returned by the server.

Stripe test keys for `.env.local`:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PREMIUM_PRICE_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### Supabase dashboard setup

Sign in does not work until the Supabase project is configured. In the Supabase dashboard:

1. Open Authentication, then Providers, and enable the Email provider.
2. For a smooth local prototype, turn off "Confirm email" under the Email provider, or be ready to click the confirmation link the first time. With confirmation on, a new sign up cannot sign in until the email is confirmed.
3. Open Authentication, then URL Configuration. Set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the Redirect URLs for local development.
4. Copy the project URL and the anon key into `.env.local` as both the server keys and the `NEXT_PUBLIC` keys.

## Personalization

Signed in users can follow teams and players from the `/you` page and get a personalized starting point.

- `user_follows` stores one row per follow, with foreign keys to `teams` and `players`, so a follow can only point at an entity that exists in our data.
- `lib/follows/service.ts` is the server side service. Every read and write takes the user id from the server session, never from request input, so a user can only see and change their own follows. Reads use the read only transaction, writes use the trusted parameterized write path, and the team or player is checked to exist before a follow is stored.
- `/api/follows` exposes follow, unfollow, and list. It returns 401 when signed out.
- Each followed team or player offers a couple of suggested questions built only from the entity name. They are ordinary questions sent through `/api/ask`, so they are answered by the same grounded pipeline with real SQL and real rows. No statistic is precomputed or injected into a suggestion.

This feature adds no new environment variables. Signed out users see the normal ask experience unchanged.

## Multilingual Output

The ask page has a language selector. The grounded answer is written in the chosen language, defaulting to English.

This is output translation only. The supported set lives in `lib/i18n/languages.ts` (English, Spanish, French, Portuguese, German). Anything outside it falls back to English.

- Only the natural language wording changes with the language. Every figure still comes from the real query result. The explanation step is told to copy numbers exactly and never translate, round, or invent one.
- The SQL generation, retrieval, schema, glossary, and dataset reference stay in English. The model writes correct read only SQL even when the answer is requested in another language, and the numbers still come from the rows.
- The grounding verifier checks numbers, which are language independent, so it still flags an untraceable number in any language.
- The semantic cache is language aware. The `query_cache.language` column is part of the lookup and the write, so a cached English answer is never served for a Spanish request or the other way round.

Known limitation for a later slice: a question asked in a non English language still retrieves against the English glossary, so retrieval for non English input may be weaker even though the model usually writes correct SQL anyway. This slice does not solve multilingual retrieval.

This feature adds no new environment variables.

## Data Providers

All football data access goes through `StatsProvider` in `lib/providers/types.ts`. Application code should import `getProvider()` from `lib/providers` and depend only on neutral types such as `Competition`, `Match`, `Team`, `Player`, and `MatchEvent`.

The current implementation is `StatsBombOpenDataProvider`, which reads official StatsBomb Open Data JSON from GitHub for non-commercial prototyping only.

To add a new provider:

1. Create a provider class in `lib/providers/` that implements `StatsProvider`.
2. Map the source response into the neutral return types inside that provider file.
3. Register the provider in `lib/providers/index.ts`.
4. Set `DATA_PROVIDER` to the new provider id.

No code outside provider implementations should depend on source-specific response shapes.

### API-Football provider

`ApiFootballProvider` in `lib/providers/api-football.ts` is the licensed commercial backbone. Commercial use is permitted on every API-Football tier. Selecting it is a single switch: set `DATA_PROVIDER=api_football` and provide `API_FOOTBALL_KEY`. No code outside the provider layer changes.

- It uses the direct API at `https://v3.football.api-sports.io` with the `x-apisports-key` header, not the RapidAPI variant.
- It maps leagues to competitions, fixtures to matches, fixture events to events, and squads to players, with a neutral competition id of `leagueId:season`. Every API-Football specific shape stays inside the provider file.
- Real source limitation: API-Football provides no event level pitch coordinates, so expected threat, VAEP, and expected goals cannot be computed from it. Coordinate and detail dependent fields (location, end location, body part, pass type, shot type, play pattern) are left undefined and never fabricated. The deep analytics stay StatsBomb only.
- It is request frugal, caches responses in memory within a run, and the free tier allows 100 requests per day.

Unit tests in `lib/providers/__tests__/api-football.test.ts` feed saved API-Football JSON through the mapping with a stub transport, so the mapping is verified without spending the daily quota.

A bounded live check fetches one league and a few fixtures with the real key and prints the mapped neutral output, about three requests, writing nothing to the database:

```bash
npm run verify:api-football
```

### Multi source setup

Both feeds live in one database, separated by a `source` column and an id convention, so the grounded model answers across both from one query surface.

- **Source column.** `source` is on `competitions`, `teams`, `players`, `player_teams`, `matches`, and `match_events`. Existing StatsBomb rows default to `statsbomb`. Filter on `source` to restrict a query to one feed.
- **Id convention.** StatsBomb keeps its bare numeric ids and source `statsbomb`. API-Football data is written with an `af:` id prefix and source `api_football`. A prefixed id can never collide with a bare StatsBomb number, so this is additive and safe. The convention lives in one place in `scripts/etl.ts`.
- **Capability difference.** StatsBomb competitions carry shot level event detail and the derived metrics expected threat, VAEP, and expected goals. API-Football competitions carry results, goals, cards, and squads, but no shot level detail and none of those metrics. API-Football events have no coordinates, so the SPADL adapter drops them and they produce no derived metrics. The dataset reference, the glossary, and the `source` column comments teach the model this, so asked for a metric a feed does not have it returns a truthful no data answer rather than inventing one.

#### Running a bounded API-Football load

Select the source and competition with environment variables, then run the existing ETL. Nothing else changes.

```bash
DATA_PROVIDER=api_football ETL_COMPETITION_IDS=39:2023 ETL_MAX_EVENT_MATCHES=20 npm run etl
```

Request budget for one league season, for example Premier League 2023: about 1 request for the leagues list, 1 for the season fixtures, one squad request per team (around 20), and one events request per match up to `ETL_MAX_EVENT_MATCHES`. With the cap at 20 that is roughly 42 requests, well under the free tier of 100 per day. The cap applies only to API-Football; the StatsBomb path is unchanged and loads events for every match. Upserts are keyed on the prefixed ids, so a re-run does not duplicate. A second full run in the same day would add another budget, so keep runs spaced under the daily limit.
