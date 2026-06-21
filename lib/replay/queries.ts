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

export async function getReplayData(clipId: string): Promise<ReplayData | null> {
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
