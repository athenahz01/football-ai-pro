-- Broadcast computer vision source for Phase 2.
-- This migration is additive and idempotent. It only creates tables and indexes
-- with "if not exists" and never drops, alters away, or deletes existing data, and
-- it never rewrites an existing key.
--
-- This is proprietary tracking data derived from our own computer vision pipeline,
-- not from StatsBomb or API-Football. It is labelled as a third source,
-- broadcast_cv, alongside statsbomb and api_football, and its ids are namespaced
-- with a cv: prefix so they never collide with the other sources. The metrics are
-- per anonymous track, a tracked player or the ball, not per identified player, so
-- there are no foreign keys to players or teams. The units are explicit: meters and
-- meters per second only when the clip was calibrated against known pitch
-- positions, otherwise image pixels and pixels per second. Pixel metrics are never
-- relabelled as meters.

create table if not exists cv_clips (
  clip_id text primary key,
  source text not null default 'broadcast_cv',
  clip_name text not null,
  source_video text,
  license text,
  license_url text,
  author text,
  fps numeric,
  frame_count integer,
  width integer,
  height integer,
  calibrated boolean not null default false,
  distance_units text not null,
  speed_units text not null,
  computed_at timestamptz not null default now()
);

comment on table cv_clips is 'One row per video clip processed by our own computer vision pipeline. Proprietary broadcast_cv source, distinct from statsbomb and api_football. Only openly licensed clips or clips whose rights were confirmed are processed.';
comment on column cv_clips.clip_id is 'Stable clip identifier, namespaced with a cv: prefix so it never collides with other sources.';
comment on column cv_clips.source is 'Always broadcast_cv. This is proprietary computer vision tracking data.';
comment on column cv_clips.clip_name is 'Short human name for the clip.';
comment on column cv_clips.source_video is 'Path or name of the source video the tracks came from.';
comment on column cv_clips.license is 'License of the source clip, for example CC BY 3.0. Only openly licensed or rights confirmed clips are processed.';
comment on column cv_clips.license_url is 'URL of the source clip license.';
comment on column cv_clips.author is 'Attribution for the source clip.';
comment on column cv_clips.fps is 'Frames per second of the processed clip.';
comment on column cv_clips.frame_count is 'Number of frames processed.';
comment on column cv_clips.width is 'Frame width in pixels.';
comment on column cv_clips.height is 'Frame height in pixels.';
comment on column cv_clips.calibrated is 'True when the clip was calibrated against known pitch positions, so the metrics are in meters. False means the metrics are in image pixels.';
comment on column cv_clips.distance_units is 'Units of distance metrics for this clip: meters when calibrated, otherwise pixels.';
comment on column cv_clips.speed_units is 'Units of speed metrics for this clip: meters_per_second when calibrated, otherwise pixels_per_second.';
comment on column cv_clips.computed_at is 'Timestamp the loader last wrote this clip.';

create table if not exists cv_track_metrics (
  clip_id text not null references cv_clips (clip_id),
  track_id text not null,
  source text not null default 'broadcast_cv',
  class text not null,
  frame_count integer not null default 0,
  first_frame integer,
  last_frame integer,
  time_tracked_seconds numeric,
  total_distance numeric,
  top_speed numeric,
  average_speed numeric,
  distance_units text not null,
  speed_units text not null,
  computed_at timestamptz not null default now(),
  primary key (clip_id, track_id)
);

comment on table cv_track_metrics is 'Movement metrics for one anonymous track in a processed clip, from our own computer vision pipeline. Proprietary broadcast_cv source. Each row is a tracked player or the ball, not an identified player, so there are no links to players or teams. These metrics exist only for processed clips, never for statsbomb or api_football competitions.';
comment on column cv_track_metrics.clip_id is 'Clip this track belongs to. Join to cv_clips for clip and license context.';
comment on column cv_track_metrics.track_id is 'Stable anonymous track identifier within the clip, namespaced with a cv: prefix.';
comment on column cv_track_metrics.source is 'Always broadcast_cv.';
comment on column cv_track_metrics.class is 'What the track is: player or ball. The player is anonymous, not identified.';
comment on column cv_track_metrics.frame_count is 'Number of frames the track was seen in.';
comment on column cv_track_metrics.first_frame is 'First frame index the track appears in.';
comment on column cv_track_metrics.last_frame is 'Last frame index the track appears in.';
comment on column cv_track_metrics.time_tracked_seconds is 'Seconds the track was followed.';
comment on column cv_track_metrics.total_distance is 'Total distance the track travelled, in the clip distance_units. Meters when calibrated, otherwise pixels.';
comment on column cv_track_metrics.top_speed is 'Highest frame to frame speed for the track, in the clip speed_units. Meters per second when calibrated, otherwise pixels per second.';
comment on column cv_track_metrics.average_speed is 'Average speed over the time tracked, in the clip speed_units.';
comment on column cv_track_metrics.distance_units is 'Units of total_distance: meters when calibrated, otherwise pixels.';
comment on column cv_track_metrics.speed_units is 'Units of the speed metrics: meters_per_second when calibrated, otherwise pixels_per_second.';
comment on column cv_track_metrics.computed_at is 'Timestamp the loader last wrote this row.';

create index if not exists cv_clips_source_idx on cv_clips (source);
create index if not exists cv_track_metrics_clip_id_idx on cv_track_metrics (clip_id);
create index if not exists cv_track_metrics_class_idx on cv_track_metrics (class);
create index if not exists cv_track_metrics_source_idx on cv_track_metrics (source);
create index if not exists cv_track_metrics_total_distance_idx on cv_track_metrics (total_distance);
