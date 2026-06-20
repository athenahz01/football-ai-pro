-- Source dimension for the multi source backbone.
-- This migration is additive and idempotent. It only adds a column and indexes
-- with "if not exists" and never drops, alters away, or deletes existing data, and
-- it never rewrites a primary key. Existing rows default to 'statsbomb', which
-- correctly labels everything already loaded.
--
-- Both datasets live in one database. StatsBomb keeps its bare numeric ids and is
-- marked source 'statsbomb'. API-Football data is written with an 'af:' id prefix
-- and source 'api_football', so a prefixed id can never collide with a bare
-- StatsBomb number. The source column tells the text to SQL model which feed a row
-- came from, and therefore what detail to expect: StatsBomb rows carry shot level
-- detail and the derived metrics expected threat, VAEP, and expected goals, while
-- API-Football rows carry results, goals, cards, and squads but no shot level
-- detail and none of those metrics.

alter table competitions add column if not exists source text not null default 'statsbomb';
alter table teams add column if not exists source text not null default 'statsbomb';
alter table players add column if not exists source text not null default 'statsbomb';
alter table player_teams add column if not exists source text not null default 'statsbomb';
alter table matches add column if not exists source text not null default 'statsbomb';
alter table match_events add column if not exists source text not null default 'statsbomb';

comment on column competitions.source is 'Data feed this competition came from: statsbomb or api_football. StatsBomb competitions carry shot level event detail and the derived metrics expected threat, VAEP, and expected goals. API-Football competitions carry results, goals, cards, and squads but no shot level detail and none of those metrics.';
comment on column teams.source is 'Data feed this team came from: statsbomb or api_football. Filter on it to restrict to one feed.';
comment on column players.source is 'Data feed this player came from: statsbomb or api_football. Filter on it to restrict to one feed.';
comment on column player_teams.source is 'Data feed this player-team link came from: statsbomb or api_football.';
comment on column matches.source is 'Data feed this match came from: statsbomb or api_football. Filter on it to restrict a query to one feed.';
comment on column match_events.source is 'Data feed this event came from: statsbomb or api_football. StatsBomb events carry coordinates, body part, and shot detail and feed the derived metrics. API-Football events are goals, cards, substitutions, and similar, with no coordinates, so they produce no SPADL actions and no expected threat, VAEP, or expected goals.';

create index if not exists competitions_source_idx on competitions (source);
create index if not exists teams_source_idx on teams (source);
create index if not exists players_source_idx on players (source);
create index if not exists matches_source_idx on matches (source);
create index if not exists match_events_source_idx on match_events (source);
