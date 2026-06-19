-- Win probability materialization for Phase 1.
-- This migration is additive and idempotent. It only creates tables and indexes
-- with "if not exists" and never drops, alters, or deletes existing data.
-- The two tables below hold the outputs of the Elo and Dixon-Coles models so the
-- text to SQL agent can answer prediction questions from stored rows. The model
-- never generates a probability directly. Every probability traces to a row here.

create table if not exists team_ratings (
  team_id text primary key references teams(team_id),
  elo_rating numeric not null,
  attack_strength numeric,
  defense_strength numeric,
  matches_played integer not null default 0,
  model_version text not null,
  computed_at timestamptz not null default now()
);

comment on table team_ratings is 'Model team strength ratings for win probability. One row per team. Values are model estimates for entertainment, not betting advice. Populated by the analytics predictions runner from match results in this database.';
comment on column team_ratings.team_id is 'Team that the rating belongs to. Join to teams.team_id for the team name.';
comment on column team_ratings.elo_rating is 'Elo rating for the team after walking forward through every match in chronological order. Higher means stronger. Ratings start at 1500 before any match.';
comment on column team_ratings.attack_strength is 'Dixon-Coles attacking strength as a multiplier around 1.0. Above 1.0 means the team scores more than an average team, below 1.0 means it scores less. Null when too few matches were available to fit the team.';
comment on column team_ratings.defense_strength is 'Dixon-Coles defensive strength as a multiplier around 1.0. Below 1.0 means the team concedes fewer goals than an average team, above 1.0 means it concedes more. Null when too few matches were available to fit the team.';
comment on column team_ratings.matches_played is 'Number of matches in this database that contributed to the team rating.';
comment on column team_ratings.model_version is 'Version label for the rating model that produced this row.';
comment on column team_ratings.computed_at is 'Timestamp when the predictions runner last wrote this row.';

create table if not exists match_predictions (
  match_id text primary key references matches(match_id),
  home_team_id text references teams(team_id),
  away_team_id text references teams(team_id),
  home_team_name text,
  away_team_name text,
  match_date date,
  stage text,
  prob_home_win numeric not null,
  prob_draw numeric not null,
  prob_away_win numeric not null,
  expected_home_goals numeric,
  expected_away_goals numeric,
  most_likely_home_goals integer,
  most_likely_away_goals integer,
  home_elo_pre numeric,
  away_elo_pre numeric,
  training_matches integer not null default 0,
  model_version text not null,
  computed_at timestamptz not null default now(),
  constraint match_predictions_prob_home_range_check check (prob_home_win >= 0 and prob_home_win <= 1),
  constraint match_predictions_prob_draw_range_check check (prob_draw >= 0 and prob_draw <= 1),
  constraint match_predictions_prob_away_range_check check (prob_away_win >= 0 and prob_away_win <= 1)
);

comment on table match_predictions is 'Pre-match win, draw, and loss probabilities for each actual match, produced by the Elo and Dixon-Coles models. One row per match. Probabilities are model estimates for entertainment, not betting advice. Each prediction uses only information available before that match, so it is an honest pre-match estimate. To answer the chance a team wins a given match, find the row for the match and read prob_home_win when the team is the home team or prob_away_win when the team is the away team.';
comment on column match_predictions.match_id is 'Match that this prediction is for. Join to matches.match_id for full match context.';
comment on column match_predictions.home_team_id is 'Home team for the match. Join to teams.team_id for the name.';
comment on column match_predictions.away_team_id is 'Away team for the match. Join to teams.team_id for the name.';
comment on column match_predictions.home_team_name is 'Home team name copied onto the prediction for source-independent display and direct filtering by team name.';
comment on column match_predictions.away_team_name is 'Away team name copied onto the prediction for source-independent display and direct filtering by team name.';
comment on column match_predictions.match_date is 'Calendar date of the match, copied from matches for convenient filtering and ordering.';
comment on column match_predictions.stage is 'Competition stage of the match, copied from matches, such as Group Stage or Final.';
comment on column match_predictions.prob_home_win is 'Pre-match probability that the home team wins in regulation and extra time, from 0 to 1. Penalty shootouts are not modeled and count as draws.';
comment on column match_predictions.prob_draw is 'Pre-match probability that the match is level after regulation and extra time, from 0 to 1.';
comment on column match_predictions.prob_away_win is 'Pre-match probability that the away team wins in regulation and extra time, from 0 to 1. The three probabilities sum to 1.';
comment on column match_predictions.expected_home_goals is 'Model expected goals for the home team in this match, the mean of the modeled home scoring distribution.';
comment on column match_predictions.expected_away_goals is 'Model expected goals for the away team in this match, the mean of the modeled away scoring distribution.';
comment on column match_predictions.most_likely_home_goals is 'Home goals in the single most likely exact scoreline under the model.';
comment on column match_predictions.most_likely_away_goals is 'Away goals in the single most likely exact scoreline under the model.';
comment on column match_predictions.home_elo_pre is 'Home team Elo rating just before this match, the rating fed into the prediction.';
comment on column match_predictions.away_elo_pre is 'Away team Elo rating just before this match, the rating fed into the prediction.';
comment on column match_predictions.training_matches is 'Number of earlier matches the Dixon-Coles fit used for this prediction. Small values mean a thin, less certain estimate, which is expected for early matches in a single tournament.';
comment on column match_predictions.model_version is 'Version label for the prediction model that produced this row.';
comment on column match_predictions.computed_at is 'Timestamp when the predictions runner last wrote this row.';

create index if not exists match_predictions_home_team_id_idx on match_predictions (home_team_id);
create index if not exists match_predictions_away_team_id_idx on match_predictions (away_team_id);
create index if not exists match_predictions_match_date_idx on match_predictions (match_date);
create index if not exists match_predictions_stage_idx on match_predictions (stage);
create index if not exists team_ratings_elo_rating_idx on team_ratings (elo_rating);
