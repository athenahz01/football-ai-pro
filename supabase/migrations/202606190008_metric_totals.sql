-- Pre-aggregated metric totals for fast leaderboards and totals.
-- This migration is additive and idempotent. It only creates tables and indexes
-- with "if not exists" and never drops, alters away, or deletes existing data.
-- A correct leaderboard over the full event set joins hundreds of thousands of
-- rows and can exceed the read only executor's statement timeout. These small
-- tables hold the same totals precomputed per player or team, per competition and
-- source, so the model can answer totals and leaderboards from a tiny table well
-- within the timeout. They are filled by the analytics runner from the derived
-- action tables, never by a language model. API-Football competitions have no
-- coordinate metrics, so they simply have no rows here.

create table if not exists player_metric_totals (
  player_id text not null references players (player_id),
  competition_id text not null references competitions (competition_id),
  source text not null,
  player_name text,
  total_xt numeric,
  total_vaep numeric,
  total_vaep_offensive numeric,
  total_vaep_defensive numeric,
  total_xg numeric,
  xt_action_count integer not null default 0,
  shot_count integer not null default 0,
  action_count integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (player_id, competition_id)
);

comment on table player_metric_totals is 'Precomputed per player totals of the derived metrics for one competition, for fast leaderboards and totals without joining the full event set. Prefer this table for questions about a player''s total or a leaderboard of expected threat, VAEP, or expected goals. Filled from the derived action tables by the analytics runner.';
comment on column player_metric_totals.player_id is 'Player the totals belong to. Join to players.player_id for the name, or use player_name.';
comment on column player_metric_totals.competition_id is 'Competition the totals are scoped to.';
comment on column player_metric_totals.source is 'Data feed: statsbomb or api_football. Only statsbomb competitions have these metrics.';
comment on column player_metric_totals.player_name is 'Player name copied in for direct display and grounding.';
comment on column player_metric_totals.total_xt is 'Sum of expected threat across the player''s actions in the competition.';
comment on column player_metric_totals.total_vaep is 'Sum of total VAEP across the player''s actions in the competition.';
comment on column player_metric_totals.total_vaep_offensive is 'Sum of offensive VAEP for the player in the competition.';
comment on column player_metric_totals.total_vaep_defensive is 'Sum of defensive VAEP for the player in the competition.';
comment on column player_metric_totals.total_xg is 'Sum of expected goals across the player''s shots in the competition.';
comment on column player_metric_totals.xt_action_count is 'Number of the player''s actions that carry an expected threat value.';
comment on column player_metric_totals.shot_count is 'Number of the player''s shots with an expected goals value.';
comment on column player_metric_totals.action_count is 'Total number of the player''s SPADL actions in the competition.';
comment on column player_metric_totals.computed_at is 'Timestamp the analytics runner last wrote this row.';

create table if not exists team_metric_totals (
  team_id text not null references teams (team_id),
  competition_id text not null references competitions (competition_id),
  source text not null,
  team_name text,
  total_xt numeric,
  total_vaep numeric,
  total_vaep_offensive numeric,
  total_vaep_defensive numeric,
  total_xg numeric,
  xt_action_count integer not null default 0,
  shot_count integer not null default 0,
  action_count integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (team_id, competition_id)
);

comment on table team_metric_totals is 'Precomputed per team totals of the derived metrics for one competition, for fast leaderboards and totals without joining the full event set. Prefer this table for questions about a team''s total or a leaderboard of expected threat, VAEP, or expected goals. Filled from the derived action tables by the analytics runner.';
comment on column team_metric_totals.team_id is 'Team the totals belong to. Join to teams.team_id for the name, or use team_name.';
comment on column team_metric_totals.competition_id is 'Competition the totals are scoped to.';
comment on column team_metric_totals.source is 'Data feed: statsbomb or api_football. Only statsbomb competitions have these metrics.';
comment on column team_metric_totals.team_name is 'Team name copied in for direct display and grounding.';
comment on column team_metric_totals.total_xt is 'Sum of expected threat across the team''s actions in the competition.';
comment on column team_metric_totals.total_vaep is 'Sum of total VAEP across the team''s actions in the competition.';
comment on column team_metric_totals.total_vaep_offensive is 'Sum of offensive VAEP for the team in the competition.';
comment on column team_metric_totals.total_vaep_defensive is 'Sum of defensive VAEP for the team in the competition.';
comment on column team_metric_totals.total_xg is 'Sum of expected goals across the team''s shots in the competition.';
comment on column team_metric_totals.xt_action_count is 'Number of the team''s actions that carry an expected threat value.';
comment on column team_metric_totals.shot_count is 'Number of the team''s shots with an expected goals value.';
comment on column team_metric_totals.action_count is 'Total number of the team''s SPADL actions in the competition.';
comment on column team_metric_totals.computed_at is 'Timestamp the analytics runner last wrote this row.';

create index if not exists player_metric_totals_competition_idx on player_metric_totals (competition_id);
create index if not exists player_metric_totals_source_idx on player_metric_totals (source);
create index if not exists player_metric_totals_total_xt_idx on player_metric_totals (total_xt);
create index if not exists team_metric_totals_competition_idx on team_metric_totals (competition_id);
create index if not exists team_metric_totals_source_idx on team_metric_totals (source);
create index if not exists team_metric_totals_total_xt_idx on team_metric_totals (total_xt);
