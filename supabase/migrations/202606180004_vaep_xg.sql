alter table action_values
  add column if not exists vaep_offensive numeric,
  add column if not exists vaep_defensive numeric,
  add column if not exists vaep_value numeric;

comment on column action_values.vaep_offensive is 'VAEP offensive value for the action, computed from the change in the modeled probability that the acting team scores soon.';
comment on column action_values.vaep_defensive is 'VAEP defensive value for the action, computed from the change in the modeled probability that the acting team concedes soon.';
comment on column action_values.vaep_value is 'Total VAEP value for the action, equal to offensive value plus defensive value.';

create table if not exists shot_xg (
  action_id text primary key references spadl_actions(action_id),
  match_id text not null references matches(match_id),
  team_id text references teams(team_id),
  player_id text references players(player_id),
  xg numeric not null
);

comment on table shot_xg is 'Open expected goals values for shot actions, trained from the loaded neutral event data and keyed to SPADL actions.';
comment on column shot_xg.action_id is 'SPADL action identifier for the shot action.';
comment on column shot_xg.match_id is 'Match that contains the shot action.';
comment on column shot_xg.team_id is 'Team that took the shot when known.';
comment on column shot_xg.player_id is 'Player who took the shot when known.';
comment on column shot_xg.xg is 'Expected goals probability for the shot from the open prototype model.';

create index if not exists shot_xg_match_id_idx on shot_xg (match_id);
create index if not exists shot_xg_team_id_idx on shot_xg (team_id);
create index if not exists shot_xg_player_id_idx on shot_xg (player_id);
create index if not exists shot_xg_xg_idx on shot_xg (xg);
