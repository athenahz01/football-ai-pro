-- Per frame track positions for the 3D replay, part of the broadcast_cv source.
-- This migration is additive and idempotent. It only creates a table and indexes
-- with "if not exists" and never drops, alters away, or deletes existing data, and
-- it never rewrites an existing key.
--
-- cv_track_metrics holds the aggregate movement metrics. A replay needs the frame
-- by frame positions, which this table stores. One row is one anonymous track at
-- one frame. Positions are normalized to the video frame, x and y from 0 to 1, and
-- they are image space, not a real pitch in meters. Real pitch coordinates in
-- meters require a calibrated, rights confirmed clip; the current sample is not
-- calibrated, so these stay image space. Ids carry the cv: prefix and source is
-- broadcast_cv, consistent with the other CV tables.

create table if not exists cv_track_points (
  clip_id text not null references cv_clips (clip_id),
  track_id text not null,
  frame_index integer not null,
  time_seconds numeric,
  x numeric not null,
  y numeric not null,
  source text not null default 'broadcast_cv',
  primary key (clip_id, track_id, frame_index)
);

comment on table cv_track_points is 'Per frame positions of anonymous tracks in a processed clip, for the 3D replay. Proprietary broadcast_cv source. One row per track per frame. Positions are normalized to the video frame and are image space, not a real pitch in meters. Meters require a calibrated clip.';
comment on column cv_track_points.clip_id is 'Clip the point belongs to. Join to cv_clips for clip and license context.';
comment on column cv_track_points.track_id is 'Anonymous track the point belongs to, namespaced with a cv: prefix, matching cv_track_metrics.track_id.';
comment on column cv_track_points.frame_index is 'Frame index of this position within the clip.';
comment on column cv_track_points.time_seconds is 'Time in seconds of this frame from the start of the processed clip.';
comment on column cv_track_points.x is 'Horizontal position normalized to the frame width, from 0 at the left to 1 at the right. Image space, not meters.';
comment on column cv_track_points.y is 'Vertical position normalized to the frame height, from 0 at the top to 1 at the bottom. Image space, not meters.';
comment on column cv_track_points.source is 'Always broadcast_cv.';

create index if not exists cv_track_points_clip_id_idx on cv_track_points (clip_id);
create index if not exists cv_track_points_clip_track_idx on cv_track_points (clip_id, track_id);
