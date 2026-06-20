-- Personalized following for Phase 1.
-- This migration is additive and idempotent. It only creates a table and indexes
-- with "if not exists" and never drops, alters, or deletes existing data.
-- A row records that one signed in user follows one team or one player. Real
-- foreign keys to teams and players mean a follow can only ever point at an entity
-- that exists in our own data, so a follow is just a dimension label, never a
-- statistic. The check constraint enforces that exactly one of team_id or player_id
-- is set. The user id is the Supabase auth user id and is always taken from the
-- server session, never from request input. This table is infrastructure for
-- personalization and is never queried by the text to SQL model.

create table if not exists user_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  team_id text references teams (team_id),
  player_id text references players (player_id),
  created_at timestamptz not null default now(),
  constraint user_follows_exactly_one_entity_check
    check ((team_id is not null) <> (player_id is not null))
);

comment on table user_follows is 'Teams and players that signed in users follow. One row per follow. The user id is the Supabase auth user id taken from the server session. Foreign keys guarantee a follow points at a real team or player.';
comment on column user_follows.user_id is 'Supabase auth user id that owns this follow. Always taken from the server session, never from request input.';
comment on column user_follows.team_id is 'Followed team when the follow is for a team, referencing teams.team_id. Null when the follow is for a player.';
comment on column user_follows.player_id is 'Followed player when the follow is for a player, referencing players.player_id. Null when the follow is for a team.';
comment on column user_follows.created_at is 'Timestamp when the follow was created.';

-- A user can follow a given team or player at most once. Partial unique indexes
-- enforce this without conflicting with the null entity column on each row.
create unique index if not exists user_follows_user_team_unique
  on user_follows (user_id, team_id)
  where team_id is not null;
create unique index if not exists user_follows_user_player_unique
  on user_follows (user_id, player_id)
  where player_id is not null;
create index if not exists user_follows_user_id_idx on user_follows (user_id);
