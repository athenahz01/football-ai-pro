create table if not exists shot_freeze_frames (
  event_id text not null references match_events(event_id),
  frame_index integer not null,
  location_x numeric not null,
  location_y numeric not null,
  teammate boolean not null,
  position text,
  actor boolean,
  source text not null default 'statsbomb',
  primary key (event_id, frame_index)
);

comment on table shot_freeze_frames is 'Frozen player positions visible at the instant a shot is taken. One row is one visible player in a shot freeze frame, keyed to the shot event.';
comment on column shot_freeze_frames.event_id is 'Shot event whose freeze frame supplied this player position. References match_events.event_id.';
comment on column shot_freeze_frames.frame_index is 'Stable order of the visible player within the shot freeze frame for this event.';
comment on column shot_freeze_frames.location_x is 'Horizontal pitch coordinate of the visible player at the instant of the shot.';
comment on column shot_freeze_frames.location_y is 'Vertical pitch coordinate of the visible player at the instant of the shot.';
comment on column shot_freeze_frames.teammate is 'True when the visible player is on the shooting team, false when the player is an opponent.';
comment on column shot_freeze_frames.position is 'Player position label from the provider at the instant of the shot, such as Goalkeeper, Center Back, or Striker.';
comment on column shot_freeze_frames.actor is 'True when the provider marks this visible player as the actor for the shot frame. Null when the provider does not supply that flag.';
comment on column shot_freeze_frames.source is 'Data feed this freeze-frame row came from. StatsBomb competitions may provide shot freeze frames; other sources should leave this table empty unless they supply equivalent shot-frame positions.';

create index if not exists shot_freeze_frames_event_id_idx on shot_freeze_frames (event_id);
create index if not exists shot_freeze_frames_source_idx on shot_freeze_frames (source);
