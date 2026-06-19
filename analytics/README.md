# Analytics

This module reads the neutral Postgres schema, converts match events to SPADL actions, computes expected threat, VAEP, and open expected goals, then upserts derived rows.

## Setup On Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Setup On Unix Shells

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Environment

Add `SUPABASE_DB_URL` to `.env.local`. It must be the Postgres connection string for the Supabase database. The analytics job never prints it.

## Run

```bash
python -m analytics.run
```

Run twice and compare row counts:

```bash
python -m analytics.run --verify-idempotency
```

The job reads only from `matches` and `match_events`, then upserts `spadl_actions`, `action_values`, and `shot_xg`.

## Glossary Seed

After applying the glossary migration, seed the retrieval glossary:

```bash
python -m analytics.seed_glossary
```

Run twice and compare row counts:

```bash
python -m analytics.seed_glossary --verify-idempotency
```

The glossary describes the neutral schema and stores exact label values for grounding, such as `Shot` for `match_events.type` and `shot` for `spadl_actions.spadl_type`.

## Win Probability

After applying the win probability migration, compute and store the predictions:

```bash
python -m analytics.run_predictions
```

Run twice and compare row counts:

```bash
python -m analytics.run_predictions --verify-idempotency
```

This walks forward through every match in date order. For each match it reads the
Elo ratings as they stood before kickoff, fits the Dixon-Coles model on earlier
matches only, predicts the result, then updates Elo with the real score. It upserts
the pre-match probabilities into `match_predictions` and the final ratings into
`team_ratings`. Every prediction uses only earlier matches, so no number is
hindsight and no probability comes from a language model.

Report the honest walk-forward accuracy:

```bash
python -m analytics.backtest
```

This writes `analytics/reports/win_probability_backtest.md`. On the current data,
a single 64 match tournament with cold-start Elo, the model is close to a uniform
guess. That is expected and the report says so. Real accuracy validation comes when
the licensed historical backbone provides seasons of matches to fit on.

## Reload Check

After applying the event enrichment migration and rerunning the ETL, this query confirms the row count and the new column population:

```sql
select
  count(*) as event_count,
  count(body_part) as body_part_events,
  count(under_pressure) as pressure_events,
  count(play_pattern) as play_pattern_events,
  count(is_cross) as cross_flags,
  count(pass_type) as pass_type_events,
  count(shot_type) as shot_type_events
from match_events;
```
