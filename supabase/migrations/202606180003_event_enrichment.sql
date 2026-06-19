alter table match_events
  add column if not exists body_part text,
  add column if not exists under_pressure boolean,
  add column if not exists play_pattern text,
  add column if not exists is_cross boolean,
  add column if not exists pass_type text,
  add column if not exists shot_type text;

comment on column match_events.body_part is 'Neutral body part used for the event when known. Values are left_foot, right_foot, head, other, or keeper_hands.';
comment on column match_events.under_pressure is 'True when the event occurred while the player was under opponent pressure, false when known to be unpressured, and null when unknown.';
comment on column match_events.play_pattern is 'Neutral play pattern for the event. Values are regular_play, from_corner, from_free_kick, from_throw_in, from_goal_kick, from_kick_off, from_counter, from_keeper, or other.';
comment on column match_events.is_cross is 'True when a pass event is a cross, false for known non-cross passes, and null for non-pass events or unknown values.';
comment on column match_events.pass_type is 'Neutral pass type when the event is a pass. Values are open_play, corner, free_kick, throw_in, goal_kick, or kick_off.';
comment on column match_events.shot_type is 'Neutral shot type when the event is a shot. Values are open_play, penalty, free_kick, or corner.';

create index if not exists match_events_body_part_idx on match_events (body_part);
create index if not exists match_events_play_pattern_idx on match_events (play_pattern);
create index if not exists match_events_pass_type_idx on match_events (pass_type);
create index if not exists match_events_shot_type_idx on match_events (shot_type);
