# Deployment runbook

This is the step by step to deploy Football AI Pro to Vercel. The actual deploy
happens on Athena Huo's accounts. Do not make the app publicly reachable until the
legal decision below is made.

## Before you deploy: the legal gate

The current database is mostly StatsBomb Open Data, which is licensed for non
commercial development only. A public beta that serves StatsBomb data needs the
StatsBomb Open Data terms confirmed in writing for that use. Until that is
confirmed, either keep the app private and access controlled, or serve only
API-Football data, which permits commercial use. This is Athena Huo's call. The
deploy steps below prepare the app; they do not make it public.

## Environment variables for Vercel

Set these in the Vercel project settings. Server only values must not have the
`NEXT_PUBLIC` prefix, so they never reach the browser.

| Variable | Scope | Where it comes from |
| --- | --- | --- |
| `SUPABASE_URL` | server | Supabase project settings, API |
| `SUPABASE_ANON_KEY` | server | Supabase project settings, API, anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | server, secret | Supabase project settings, API, service role key |
| `SUPABASE_DB_URL` | server, secret | Supabase project settings, database connection string |
| `ANTHROPIC_API_KEY` | server, secret | Anthropic console |
| `ANTHROPIC_MODEL` | server, optional | defaults to `claude-haiku-4-5-20251001` |
| `DATA_PROVIDER` | server | `statsbomb_open` or `api_football` |
| `API_FOOTBALL_KEY` | server, secret | API-Football dashboard, only needed for live api_football requests |
| `NEXT_PUBLIC_SUPABASE_URL` | public | same value as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | same value as `SUPABASE_ANON_KEY`, the anon key is safe to expose |
| `SEMANTIC_CACHE_ENABLED` | server, optional | defaults to on |
| `SEMANTIC_CACHE_SIMILARITY_THRESHOLD` | server, optional | defaults to 0.97 |
| `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY` | server, optional | anonymous IP limits, defaults 12 and 300 |
| `RATE_LIMIT_USER_PER_MINUTE`, `RATE_LIMIT_USER_PER_DAY` | server, optional | signed in limits, defaults 30 and 1000 |
| `ANTHROPIC_INPUT_USD_PER_MTOK`, `ANTHROPIC_OUTPUT_USD_PER_MTOK`, `ANTHROPIC_CACHE_READ_USD_PER_MTOK`, `ANTHROPIC_CACHE_WRITE_USD_PER_MTOK` | server, optional | model prices, default to Haiku 4.5 |

Do not set `ANTHROPIC_BASE_URL`. If it is set without the `/v1` path it breaks the
Anthropic SDK. Leave it unset so the SDK uses its correct default.

## Supabase auth settings for the production domain

In the Supabase dashboard, Authentication, URL Configuration:

1. Set the Site URL to the production domain, for example `https://yourapp.vercel.app`.
2. Add the production domain to the Redirect URLs, for example `https://yourapp.vercel.app/**`.
3. Keep the Email provider enabled. Decide whether email confirmation is on; with it
   off, sign up and sign in work immediately.

## Deploy steps

1. Connect the GitHub repository to a new Vercel project. Framework preset is Next.js.
2. Add every environment variable above in the Vercel project settings.
3. Confirm the database already has the schema and data. Apply any pending migrations
   from `supabase/migrations` in filename order, see `supabase/migrations/README.md`.
4. Deploy. The build command is the default `next build`.
5. Update the Supabase auth URL settings to the deployed domain, as above.
6. Smoke test in a private setting: ask a question, sign in, ask a personalized and a
   prediction question, confirm the entertainment framing shows.
7. Keep the deployment private or access controlled until the legal gate above is
   resolved.

## Production note on the embedder

The query time embedder currently runs a local transformers model in process. See
the Phase 1 completion report for the cold start assessment and the recommendation
to move it to a hosted or dedicated embedding service before opening real traffic.
