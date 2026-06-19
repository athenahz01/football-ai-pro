create table if not exists competitions (
  competition_id text primary key,
  name text not null,
  country text,
  season_name text,
  gender text not null default 'unknown',
  is_international boolean not null default false,
  is_youth boolean not null default false,
  constraint competitions_gender_check check (gender in ('female', 'male', 'mixed', 'unknown'))
);

comment on table competitions is 'Football competitions and seasons available for querying. One row represents one competition in one season.';
comment on column competitions.competition_id is 'Stable provider-neutral identifier for a competition season.';
comment on column competitions.name is 'Display name of the competition, such as a league, cup, or international tournament.';
comment on column competitions.country is 'Country or region associated with the competition when known.';
comment on column competitions.season_name is 'Season label for the competition, such as a year or season span.';
comment on column competitions.gender is 'Gender category for the competition: female, male, mixed, or unknown.';
comment on column competitions.is_international is 'True when the competition is contested by national teams or crosses national association boundaries.';
comment on column competitions.is_youth is 'True when the competition is a youth competition.';

create table if not exists teams (
  team_id text primary key,
  name text not null,
  country text,
  gender text not null default 'unknown',
  group_name text,
  constraint teams_gender_check check (gender in ('female', 'male', 'mixed', 'unknown'))
);

comment on table teams is 'Football teams that appear in matches, independent of the upstream data source.';
comment on column teams.team_id is 'Stable provider-neutral identifier for the team.';
comment on column teams.name is 'Display name of the team.';
comment on column teams.country is 'Country associated with the team when known.';
comment on column teams.gender is 'Gender category for the team: female, male, mixed, or unknown.';
comment on column teams.group_name is 'Competition group or pool name for the team when the match data includes one.';

create table if not exists players (
  player_id text primary key,
  name text not null,
  display_name text,
  country text
);

comment on table players is 'Football players who appear in lineups or match events.';
comment on column players.player_id is 'Stable provider-neutral identifier for the player.';
comment on column players.name is 'Full player name from the neutral data provider type.';
comment on column players.display_name is 'Optional commonly used player name when it differs from the full name.';
comment on column players.country is 'Country associated with the player when known.';

create table if not exists player_teams (
  player_id text not null references players(player_id),
  team_id text not null references teams(team_id),
  jersey_number integer,
  positions text[] not null default array[]::text[],
  primary key (player_id, team_id)
);

comment on table player_teams is 'Relationship between players and teams, with team-specific shirt and position context when known.';
comment on column player_teams.player_id is 'Player identifier for the player-team relationship.';
comment on column player_teams.team_id is 'Team identifier for the player-team relationship.';
comment on column player_teams.jersey_number is 'Shirt number used by the player for the team when known.';
comment on column player_teams.positions is 'Known football positions for the player with this team.';

create table if not exists matches (
  match_id text primary key,
  competition_id text not null references competitions(competition_id),
  season_name text,
  match_date date not null,
  kickoff_time time,
  home_team_id text not null references teams(team_id),
  away_team_id text not null references teams(team_id),
  home_score integer,
  away_score integer,
  status text not null default 'unknown',
  match_week integer,
  stage text,
  venue text,
  referee text,
  constraint matches_status_check check (status in ('available', 'complete', 'postponed', 'scheduled', 'unknown')),
  constraint matches_distinct_teams_check check (home_team_id <> away_team_id)
);

comment on table matches is 'Football matches with competition, date, teams, score, and venue context for analytical queries.';
comment on column matches.match_id is 'Stable provider-neutral identifier for the match.';
comment on column matches.competition_id is 'Competition season that the match belongs to.';
comment on column matches.season_name is 'Season label copied onto the match for convenient querying.';
comment on column matches.match_date is 'Calendar date when the match was played or scheduled.';
comment on column matches.kickoff_time is 'Local kickoff time when known.';
comment on column matches.home_team_id is 'Team listed as the home team for the match.';
comment on column matches.away_team_id is 'Team listed as the away team for the match.';
comment on column matches.home_score is 'Final or current score for the home team when available.';
comment on column matches.away_score is 'Final or current score for the away team when available.';
comment on column matches.status is 'Availability or scheduling status for the match.';
comment on column matches.match_week is 'Competition round or match week number when known.';
comment on column matches.stage is 'Competition stage for the match, such as group stage or final.';
comment on column matches.venue is 'Stadium or venue name when known.';
comment on column matches.referee is 'Main referee name when known.';

create table if not exists match_events (
  event_id text primary key,
  match_id text not null references matches(match_id),
  sequence integer not null,
  period integer not null,
  minute integer not null,
  second integer not null,
  type text not null,
  team_id text references teams(team_id),
  team_name text,
  player_id text references players(player_id),
  player_name text,
  possession_team_id text references teams(team_id),
  possession_team_name text,
  location_x numeric,
  location_y numeric,
  end_location_x numeric,
  end_location_y numeric,
  duration_seconds numeric,
  outcome text
);

comment on table match_events is 'Chronological football actions and stoppages inside a match, suitable for filtering by time, team, player, and event type.';
comment on column match_events.event_id is 'Stable provider-neutral identifier for the event.';
comment on column match_events.match_id is 'Match that contains the event.';
comment on column match_events.sequence is 'Event order within the match from first to last.';
comment on column match_events.period is 'Match period number for the event, such as first half, second half, or extra time period.';
comment on column match_events.minute is 'Match clock minute when the event occurred.';
comment on column match_events.second is 'Match clock second within the minute when the event occurred.';
comment on column match_events.type is 'Event category label as supplied by the data provider, stored with its original capitalization. Example values include Shot, Pass, Substitution, and Foul Committed. Match this column on the exact label, not a lowercased form.';
comment on column match_events.team_id is 'Team responsible for the event when the event is assigned to a team.';
comment on column match_events.team_name is 'Team name copied from the event for source-independent display and auditing.';
comment on column match_events.player_id is 'Player responsible for the event when the event is assigned to a player.';
comment on column match_events.player_name is 'Player name copied from the event for source-independent display and auditing.';
comment on column match_events.possession_team_id is 'Team considered in possession at the time of the event when known.';
comment on column match_events.possession_team_name is 'Possession team name copied from the event for source-independent display and auditing.';
comment on column match_events.location_x is 'Horizontal pitch coordinate where the event began when known.';
comment on column match_events.location_y is 'Vertical pitch coordinate where the event began when known.';
comment on column match_events.end_location_x is 'Horizontal pitch coordinate where the event ended when known.';
comment on column match_events.end_location_y is 'Vertical pitch coordinate where the event ended when known.';
comment on column match_events.duration_seconds is 'Duration of the event in seconds when known.';
comment on column match_events.outcome is 'Outcome label for the event when the provider supplies one.';

create index if not exists competitions_name_idx on competitions (name);
create index if not exists teams_name_idx on teams (name);
create index if not exists players_name_idx on players (name);
create index if not exists player_teams_team_id_idx on player_teams (team_id);
create index if not exists matches_competition_id_idx on matches (competition_id);
create index if not exists matches_match_date_idx on matches (match_date);
create index if not exists matches_home_team_id_idx on matches (home_team_id);
create index if not exists matches_away_team_id_idx on matches (away_team_id);
create index if not exists match_events_match_id_idx on match_events (match_id);
create index if not exists match_events_team_id_idx on match_events (team_id);
create index if not exists match_events_player_id_idx on match_events (player_id);
create index if not exists match_events_possession_team_id_idx on match_events (possession_team_id);
create index if not exists match_events_type_idx on match_events (type);
create index if not exists match_events_minute_idx on match_events (minute);
create index if not exists match_events_period_minute_second_idx on match_events (period, minute, second);
