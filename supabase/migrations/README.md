# Migrations

There is no automated migration runner. Migrations are plain SQL applied by hand to
the Supabase Postgres database, in filename order. Filenames are
`YYYYMMDDNNNN_name.sql` and every migration is additive and idempotent
(`create table if not exists`, `add column if not exists`), so re-applying one is
safe and never rewrites a key or deletes data.

## How to apply a migration

Apply through the Supabase dashboard SQL editor, or with `psql` against
`SUPABASE_DB_URL`:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/<file>.sql
```

After applying, tick it off in the table below so applied versus pending is never a
guess.

## Applied status

All migrations below are applied to the current database as of the Phase 1
close-out.

| Migration | Purpose | Applied |
| --- | --- | --- |
| 202606180001_structured_stats | Core neutral schema: competitions, teams, players, player_teams, matches, match_events | yes |
| 202606180002_analytics | spadl_actions and action_values (expected threat) | yes |
| 202606180003_event_enrichment | Enriched match_events columns (body_part, play_pattern, pass_type, shot_type, ...) | yes |
| 202606180004_vaep_xg | VAEP columns on action_values, and the shot_xg table | yes |
| 202606180005_glossary | Verification query for glossary_terms (see note below) | yes |
| 202606190001_win_probability | team_ratings and match_predictions | yes |
| 202606190002_query_cache | Semantic answer cache with vector embedding and HNSW index | yes |
| 202606190003_rate_limit | rate_limit_counters (superseded, see note) | yes |
| 202606190004_rate_limit_subjects | rate_limit_usage keyed on an ip or user subject | yes |
| 202606190005_user_follows | Personalized following | yes |
| 202606190006_query_cache_language | Language column on query_cache | yes |
| 202606190007_source_dimension | source column on the entity and event tables | yes |
| 202606190008_metric_totals | Precomputed player and team metric totals | yes |

## Notes

- `202606180005_glossary.sql` is only a verification `select`. The `glossary_terms`
  table, the `vector` extension, and the HNSW cosine index were created directly in
  the Supabase dashboard during Phase 0, so that DDL is not captured in a migration
  file. If the database is ever rebuilt from scratch, recreate `glossary_terms` with
  a `vector(384)` embedding column and an HNSW `vector_cosine_ops` index before
  seeding the glossary. This is a known gap to close if a clean rebuild is needed.
- `rate_limit_counters` (from `202606190003`) is superseded by `rate_limit_usage`
  and is no longer written or read. It is intentionally left in place. Dropping it
  is destructive and needs Athena Huo's explicit go-ahead.
