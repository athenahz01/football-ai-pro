create table if not exists spadl_actions (
  action_id text primary key,
  match_id text not null references matches(match_id),
  action_order integer not null,
  source_event_id text not null unique references match_events(event_id),
  period integer not null,
  time_seconds numeric not null,
  team_id text references teams(team_id),
  player_id text references players(player_id),
  start_x numeric not null,
  start_y numeric not null,
  end_x numeric not null,
  end_y numeric not null,
  spadl_type text not null,
  spadl_result text not null,
  spadl_bodypart text
);

comment on table spadl_actions is 'Provider-neutral match events converted into SPADL actions for football analytics.';
comment on column spadl_actions.action_id is 'Stable identifier for the converted SPADL action. It is derived from the neutral source event.';
comment on column spadl_actions.match_id is 'Match that contains the converted action.';
comment on column spadl_actions.action_order is 'Stable action order within the match for converted actions, ascending by period then time.';
comment on column spadl_actions.source_event_id is 'Neutral match_events event_id that produced this SPADL action.';
comment on column spadl_actions.period is 'Match period number for the action.';
comment on column spadl_actions.time_seconds is 'Action time in seconds from the start of its match period.';
comment on column spadl_actions.team_id is 'Team responsible for the action when known.';
comment on column spadl_actions.player_id is 'Player responsible for the action when known.';
comment on column spadl_actions.start_x is 'SPADL start x coordinate on a 105 meter pitch, normalized so the acting team attacks left to right.';
comment on column spadl_actions.start_y is 'SPADL start y coordinate on a 68 meter pitch, normalized so the acting team attacks left to right.';
comment on column spadl_actions.end_x is 'SPADL end x coordinate on a 105 meter pitch, normalized so the acting team attacks left to right.';
comment on column spadl_actions.end_y is 'SPADL end y coordinate on a 68 meter pitch, normalized so the acting team attacks left to right.';
comment on column spadl_actions.spadl_type is 'SPADL action type such as pass, cross, dribble, shot, tackle, interception, or clearance.';
comment on column spadl_actions.spadl_result is 'SPADL result label such as success, fail, offside, owngoal, yellow_card, or red_card.';
comment on column spadl_actions.spadl_bodypart is 'SPADL body part label when known. Nullable until richer event detail is added.';

create table if not exists action_values (
  action_id text primary key references spadl_actions(action_id),
  xt_value numeric
);

comment on table action_values is 'Expected threat values for converted SPADL actions.';
comment on column action_values.action_id is 'SPADL action that this valuation belongs to.';
comment on column action_values.xt_value is 'Expected threat value for the action. Non-move actions and unsuccessful move actions have no xT value.';

create index if not exists spadl_actions_match_id_idx on spadl_actions (match_id);
create index if not exists spadl_actions_source_event_id_idx on spadl_actions (source_event_id);
create index if not exists spadl_actions_player_id_idx on spadl_actions (player_id);
create index if not exists spadl_actions_team_id_idx on spadl_actions (team_id);
create index if not exists spadl_actions_spadl_type_idx on spadl_actions (spadl_type);
create index if not exists spadl_actions_match_order_idx on spadl_actions (match_id, action_order);
create index if not exists spadl_actions_match_time_idx on spadl_actions (match_id, period, time_seconds);
create index if not exists action_values_xt_value_idx on action_values (xt_value);
