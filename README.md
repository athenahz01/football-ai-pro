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

## Data Providers

All football data access goes through `StatsProvider` in `lib/providers/types.ts`. Application code should import `getProvider()` from `lib/providers` and depend only on neutral types such as `Competition`, `Match`, `Team`, `Player`, and `MatchEvent`.

The current implementation is `StatsBombOpenDataProvider`, which reads official StatsBomb Open Data JSON from GitHub for non-commercial prototyping only.

To add a new provider:

1. Create a provider class in `lib/providers/` that implements `StatsProvider`.
2. Map the source response into the neutral return types inside that provider file.
3. Register the provider in `lib/providers/index.ts`.
4. Set `DATA_PROVIDER` to the new provider id.

No code outside provider implementations should depend on source-specific response shapes.
