import "server-only";

import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import type { SqlValue } from "@/lib/sql/types";

// Fixed, parameterized, read only queries for the 3D replay. Every query here is
// written by us, not by the language model, and runs through the read only
// transaction with a statement timeout. None of this uses the trusted write path or
// model written SQL. The positions come straight from cv_track_points, which the
// loader wrote from our own tracking of a rights confirmed clip. The positions are
// normalized to the video frame, image space, not a real pitch in meters.

const TIMEOUT_MS = 5_000;
// One clip is a few hundred points today. This cap is generous headroom for a
// longer clip while still bounding the read.
const POINT_LIMIT = 20_000;
const GOAL_LIMIT = 120;
const GOAL_SEQUENCE_LIMIT = 300;

export type GoalReplaySummary = {
  goalId: string;
  matchId: string;
  scorer: string;
  teamName: string;
  homeTeamName: string;
  awayTeamName: string;
  stage: string | null;
  minute: number;
  second: number;
  period: number;
  shotType: string | null;
  playPattern: string | null;
  xtGained: number | null;
  pathEventCount: number;
};

export type GoalReplayEvent = {
  eventId: string;
  sequence: number;
  period: number;
  minute: number;
  second: number;
  type: string;
  playerName: string | null;
  teamName: string | null;
  x: number;
  y: number;
  endX: number | null;
  endY: number | null;
  xtValue: number | null;
  isGoal: boolean;
};

export type GoalFreezeFramePlayer = {
  x: number;
  y: number;
  teammate: boolean;
  position: string | null;
  actor: boolean | null;
};

export type GoalReplayData = {
  goal: GoalReplaySummary;
  events: GoalReplayEvent[];
  freezeFrame: GoalFreezeFramePlayer[];
  source: "statsbomb";
  coordinateSystem: "statsbomb_120x80";
  freezeFrameAvailable: boolean;
};

export type ReplayClip = {
  clipId: string;
  clipName: string;
  source: string;
  license: string | null;
  licenseUrl: string | null;
  author: string | null;
  sourceVideo: string | null;
  calibrated: boolean;
  distanceUnits: string;
  fps: number | null;
  width: number | null;
  height: number | null;
};

export type ReplayPoint = {
  frame: number;
  timeSeconds: number | null;
  x: number;
  y: number;
};

export type ReplayTrack = {
  trackId: string;
  trackClass: string;
  points: ReplayPoint[];
};

export type ReplayData = {
  clip: ReplayClip;
  tracks: ReplayTrack[];
  // Number of frames the scrubber spans, the highest stored frame index plus one.
  frameCount: number;
};

export async function listGoalReplays(
  limit = GOAL_LIMIT,
): Promise<GoalReplaySummary[]> {
  const rows = await runReadOnly(
    `
      select
        me.event_id,
        me.match_id,
        me.period,
        me.minute,
        me.second,
        coalesce(p.display_name, me.player_name) as scorer,
        me.team_name,
        ht.name as home_team_name,
        at.name as away_team_name,
        m.stage,
        me.shot_type,
        me.play_pattern,
        null::numeric as xt_gained,
        0::integer as path_event_count
      from match_events me
      join matches m on m.match_id = me.match_id
      join competitions c on c.competition_id = m.competition_id
      join teams ht on ht.team_id = m.home_team_id
      join teams at on at.team_id = m.away_team_id
      left join players p on p.player_id = me.player_id
      where c.name = 'FIFA World Cup'
        and c.season_name = '2022'
        and c.source = 'statsbomb'
        and me.source = 'statsbomb'
        and me.period <= 4
        and me.type = 'Shot'
        and me.outcome = 'Goal'
        and me.location_x is not null
        and me.location_y is not null
      order by
        case
          when m.stage = 'Final'
            and me.shot_type = 'open_play'
          then 0
          else 1
        end,
        case when m.stage = 'Final' then 0 else 1 end,
        m.match_date desc,
        me.minute,
        me.second
      limit $1
    `,
    [limit],
    limit,
  );

  return rows.map(toGoalReplaySummary);
}

export async function getGoalReplayData(
  goalId: string,
): Promise<GoalReplayData | null> {
  const rows = await runReadOnly(
    `
      with goal as (
        select
          me.event_id,
          me.match_id,
          me.sequence,
          me.period,
          me.minute,
          me.second,
          me.team_id,
          me.team_name,
          coalesce(p.display_name, me.player_name) as scorer,
          me.possession_team_id,
          me.shot_type,
          me.play_pattern,
          m.stage,
          ht.name as home_team_name,
          at.name as away_team_name
        from match_events me
        join matches m on m.match_id = me.match_id
        join competitions c on c.competition_id = m.competition_id
        join teams ht on ht.team_id = m.home_team_id
        join teams at on at.team_id = m.away_team_id
        left join players p on p.player_id = me.player_id
        where me.event_id = $1
          and c.name = 'FIFA World Cup'
          and c.season_name = '2022'
          and c.source = 'statsbomb'
          and me.source = 'statsbomb'
          and me.type = 'Shot'
          and me.outcome = 'Goal'
          and me.location_x is not null
          and me.location_y is not null
      ),
      scanned as (
        select
          me.*,
          sum(
            case
              when me.possession_team_id is distinct from g.possession_team_id then 1
              else 0
            end
          ) over (
            order by me.sequence desc
            rows between unbounded preceding and current row
          ) as possession_break
        from match_events me
        cross join goal g
        where me.match_id = g.match_id
          and me.sequence <= g.sequence
      ),
      possession as (
        select s.*
        from scanned s
        cross join goal g
        where s.possession_break = 0
          and s.team_id = g.team_id
          and s.location_x is not null
          and s.location_y is not null
        order by s.sequence
        limit $2
      ),
      xt as (
        select sum(av.xt_value) as xt_gained
        from possession p
        left join spadl_actions sa on sa.source_event_id = p.event_id
        left join action_values av on av.action_id = sa.action_id
      )
      select
        g.event_id as goal_id,
        g.match_id as goal_match_id,
        g.period as goal_period,
        g.minute as goal_minute,
        g.second as goal_second,
        g.scorer,
        g.team_name as goal_team_name,
        g.home_team_name,
        g.away_team_name,
        g.stage,
        g.shot_type,
        g.play_pattern,
        xt.xt_gained,
        count(*) over () as path_event_count,
        p.event_id,
        p.sequence,
        p.period,
        p.minute,
        p.second,
        p.type,
        p.player_name,
        p.team_name,
        p.location_x,
        p.location_y,
        p.end_location_x,
        p.end_location_y,
        av.xt_value,
        p.event_id = g.event_id as is_goal
      from goal g
      join possession p on true
      cross join xt
      left join spadl_actions sa on sa.source_event_id = p.event_id
      left join action_values av on av.action_id = sa.action_id
      order by p.sequence
    `,
    [goalId, GOAL_SEQUENCE_LIMIT],
    GOAL_SEQUENCE_LIMIT,
  );

  if (rows.length === 0) {
    return null;
  }

  const freezeFrame = await getGoalFreezeFrame(goalId);
  const first = rows[0];
  return {
    goal: toGoalReplaySummary({
      event_id: first.goal_id,
      match_id: first.goal_match_id,
      period: first.goal_period,
      minute: first.goal_minute,
      second: first.goal_second,
      scorer: first.scorer,
      team_name: first.goal_team_name,
      home_team_name: first.home_team_name,
      away_team_name: first.away_team_name,
      stage: first.stage,
      shot_type: first.shot_type,
      play_pattern: first.play_pattern,
      xt_gained: first.xt_gained,
      path_event_count: first.path_event_count,
    }),
    events: rows.map(toGoalReplayEvent),
    freezeFrame,
    source: "statsbomb",
    coordinateSystem: "statsbomb_120x80",
    freezeFrameAvailable: freezeFrame.length > 0,
  };
}

export async function getGoalFreezeFrame(
  goalEventId: string,
): Promise<GoalFreezeFramePlayer[]> {
  const rows = await runReadOnly(
    `
      select
        location_x,
        location_y,
        teammate,
        position,
        actor
      from shot_freeze_frames
      where event_id = $1
      order by frame_index
    `,
    [goalEventId],
    60,
  );

  return rows.map(toGoalFreezeFramePlayer);
}

export async function listReplayClips(): Promise<ReplayClip[]> {
  const rows = await runReadOnly(
    `
      select
        c.clip_id,
        c.clip_name,
        c.source,
        c.license,
        c.license_url,
        c.author,
        c.source_video,
        c.calibrated,
        c.distance_units,
        c.fps,
        c.width,
        c.height
      from cv_clips c
      where exists (
        select 1 from cv_track_points p where p.clip_id = c.clip_id
      )
      order by c.clip_name
    `,
    [],
    100,
  );

  return rows.map(toReplayClip);
}

export async function getReplayData(
  clipId: string,
): Promise<ReplayData | null> {
  const clipRows = await runReadOnly(
    `
      select
        clip_id,
        clip_name,
        source,
        license,
        license_url,
        author,
        source_video,
        calibrated,
        distance_units,
        fps,
        width,
        height
      from cv_clips
      where clip_id = $1
    `,
    [clipId],
    1,
  );

  if (clipRows.length === 0) {
    return null;
  }

  const clip = toReplayClip(clipRows[0]);

  // The class of each track, player or ball, lives in cv_track_metrics. The viewer
  // uses it to draw the ball with a distinct marker.
  const classRows = await runReadOnly(
    `
      select track_id, class
      from cv_track_metrics
      where clip_id = $1
    `,
    [clipId],
    1_000,
  );

  const classByTrack = new Map<string, string>();
  for (const row of classRows) {
    classByTrack.set(String(row.track_id), String(row.class));
  }

  const pointRows = await runReadOnly(
    `
      select track_id, frame_index, time_seconds, x, y
      from cv_track_points
      where clip_id = $1
      order by track_id, frame_index
    `,
    [clipId],
    POINT_LIMIT,
  );

  const trackOrder: string[] = [];
  const pointsByTrack = new Map<string, ReplayPoint[]>();
  let maxFrame = -1;

  for (const row of pointRows) {
    const trackId = String(row.track_id);
    const frame = toNumber(row.frame_index) ?? 0;
    const x = toNumber(row.x);
    const y = toNumber(row.y);

    if (x === null || y === null) {
      continue;
    }

    if (!pointsByTrack.has(trackId)) {
      pointsByTrack.set(trackId, []);
      trackOrder.push(trackId);
    }

    pointsByTrack.get(trackId)!.push({
      frame,
      timeSeconds: toNumber(row.time_seconds),
      x,
      y,
    });

    if (frame > maxFrame) {
      maxFrame = frame;
    }
  }

  const tracks: ReplayTrack[] = trackOrder.map((trackId) => ({
    trackId,
    trackClass: classByTrack.get(trackId) ?? "player",
    points: pointsByTrack.get(trackId)!,
  }));

  return { clip, tracks, frameCount: maxFrame + 1 };
}

function toReplayClip(row: Record<string, SqlValue>): ReplayClip {
  return {
    clipId: String(row.clip_id),
    clipName: String(row.clip_name),
    source: String(row.source),
    license: row.license === null ? null : String(row.license),
    licenseUrl: row.license_url === null ? null : String(row.license_url),
    author: row.author === null ? null : String(row.author),
    sourceVideo: row.source_video === null ? null : String(row.source_video),
    calibrated: row.calibrated === true || row.calibrated === "true",
    distanceUnits: String(row.distance_units),
    fps: toNumber(row.fps),
    width: toNumber(row.width),
    height: toNumber(row.height),
  };
}

function toGoalReplaySummary(row: Record<string, SqlValue>): GoalReplaySummary {
  return {
    goalId: String(row.event_id),
    matchId: String(row.match_id),
    scorer: String(row.scorer ?? "Unknown scorer"),
    teamName: String(row.team_name ?? "Unknown team"),
    homeTeamName: String(row.home_team_name ?? "Home"),
    awayTeamName: String(row.away_team_name ?? "Away"),
    stage: row.stage === null ? null : String(row.stage),
    minute: toNumber(row.minute) ?? 0,
    second: toNumber(row.second) ?? 0,
    period: toNumber(row.period) ?? 0,
    shotType: row.shot_type === null ? null : String(row.shot_type),
    playPattern: row.play_pattern === null ? null : String(row.play_pattern),
    xtGained: toNumber(row.xt_gained),
    pathEventCount: toNumber(row.path_event_count) ?? 0,
  };
}

function toGoalReplayEvent(row: Record<string, SqlValue>): GoalReplayEvent {
  return {
    eventId: String(row.event_id),
    sequence: toNumber(row.sequence) ?? 0,
    period: toNumber(row.period) ?? 0,
    minute: toNumber(row.minute) ?? 0,
    second: toNumber(row.second) ?? 0,
    type: String(row.type),
    playerName: row.player_name === null ? null : String(row.player_name),
    teamName: row.team_name === null ? null : String(row.team_name),
    x: toNumber(row.location_x) ?? 0,
    y: toNumber(row.location_y) ?? 0,
    endX: toNumber(row.end_location_x),
    endY: toNumber(row.end_location_y),
    xtValue: toNumber(row.xt_value),
    isGoal: row.is_goal === true || row.is_goal === "true",
  };
}

function toGoalFreezeFramePlayer(
  row: Record<string, SqlValue>,
): GoalFreezeFramePlayer {
  return {
    x: toNumber(row.location_x) ?? 0,
    y: toNumber(row.location_y) ?? 0,
    teammate: row.teammate === true || row.teammate === "true",
    position: row.position === null ? null : String(row.position),
    actor:
      row.actor === null ? null : row.actor === true || row.actor === "true",
  };
}

async function runReadOnly(
  sql: string,
  values: unknown[],
  rowLimit: number,
): Promise<Record<string, SqlValue>[]> {
  const result = await executeSqlInReadOnlyTransaction(
    sql,
    rowLimit,
    TIMEOUT_MS,
    values,
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.rows;
}

function toNumber(value: SqlValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
