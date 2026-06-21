import "server-only";

import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import type { SqlValue } from "@/lib/sql/types";

// Fixed, parameterized, read only queries for the pitch visualizations and the
// evidence panel: the real event coordinates, outcomes, minutes, and expected goals
// for a player or team, drawn from the StatsBomb event tables. Written by us, never by
// the model, run through the read only executor, never the write path. Rich event data
// exists only for the StatsBomb competitions; feeds without event coordinates return
// nothing here, and the UI falls back honestly.

const TIMEOUT_MS = 5_000;
const SHOT_LIMIT = 600;
const PASS_LIMIT = 1_200;
const EVENT_LIMIT = 400;

export type ShotEvent = {
  x: number;
  y: number;
  minute: number | null;
  outcome: string | null;
  goal: boolean;
  xg: number | null;
  player: string;
  team: string;
};

export type PassEvent = {
  x: number;
  y: number;
  endX: number;
  endY: number;
  minute: number | null;
  completed: boolean;
  player: string;
  team: string;
};

export type EntityEvents = {
  shots: ShotEvent[];
  passes: PassEvent[];
};

// One cited event for the evidence list: the player, the minute, the team, and the
// outcome, plus its location so the selection can be drawn on the pitch.
export type CitedEvent = {
  id: string;
  type: "Shot" | "Pass";
  player: string;
  team: string;
  minute: number | null;
  outcome: string;
  x: number;
  y: number;
  endX: number | null;
  endY: number | null;
  goal: boolean;
  xg: number | null;
};

type Filter = { column: "player_id" | "team_id"; id: string };

export async function getPlayerEvents(playerId: string): Promise<EntityEvents> {
  return getEvents({ column: "player_id", id: playerId });
}

export async function getTeamEvents(teamId: string): Promise<EntityEvents> {
  return getEvents({ column: "team_id", id: teamId });
}

async function getEvents(filter: Filter): Promise<EntityEvents> {
  const [shotRows, passRows] = await Promise.all([
    runReadOnly(
      `
        select
          me.location_x as x,
          me.location_y as y,
          me.minute,
          me.outcome,
          sx.xg,
          me.player_name,
          me.team_name
        from match_events me
        left join shot_xg sx on sx.action_id = me.event_id
        where me.${filter.column} = $1 and me.type = 'Shot'
          and me.location_x is not null and me.location_y is not null
        order by me.minute nulls last
        limit $2
      `,
      [filter.id, SHOT_LIMIT],
      SHOT_LIMIT,
    ),
    runReadOnly(
      `
        select
          location_x as x,
          location_y as y,
          end_location_x as ex,
          end_location_y as ey,
          minute,
          outcome,
          player_name,
          team_name
        from match_events
        where ${filter.column} = $1 and type = 'Pass'
          and location_x is not null and location_y is not null
          and end_location_x is not null and end_location_y is not null
        order by minute nulls last
        limit $2
      `,
      [filter.id, PASS_LIMIT],
      PASS_LIMIT,
    ),
  ]);

  const shots: ShotEvent[] = shotRows.map((row) => ({
    x: toNumber(row.x) ?? 0,
    y: toNumber(row.y) ?? 0,
    minute: toNumber(row.minute),
    outcome: row.outcome === null ? null : String(row.outcome),
    goal: String(row.outcome ?? "") === "Goal",
    xg: toNumber(row.xg),
    player: String(row.player_name ?? ""),
    team: String(row.team_name ?? ""),
  }));

  const passes: PassEvent[] = passRows.map((row) => ({
    x: toNumber(row.x) ?? 0,
    y: toNumber(row.y) ?? 0,
    endX: toNumber(row.ex) ?? 0,
    endY: toNumber(row.ey) ?? 0,
    minute: toNumber(row.minute),
    completed: row.outcome === null,
    player: String(row.player_name ?? ""),
    team: String(row.team_name ?? ""),
  }));

  return { shots, passes };
}

// The cited events behind an answer: the entity's shots or passes for the evidence
// list. This is our fixed query for those exact events, the real evidence, not a
// re-summary of the answer.
export async function getCitedEvents(
  kind: "player" | "team",
  id: string,
  eventType: "Shot" | "Pass",
): Promise<CitedEvent[]> {
  const column = kind === "player" ? "player_id" : "team_id";
  const rows = await runReadOnly(
    `
      select
        me.event_id,
        me.player_name,
        me.team_name,
        me.minute,
        me.outcome,
        me.location_x as x,
        me.location_y as y,
        me.end_location_x as ex,
        me.end_location_y as ey,
        sx.xg
      from match_events me
      left join shot_xg sx on sx.action_id = me.event_id
      where me.${column} = $1 and me.type = $2
        and me.location_x is not null and me.location_y is not null
      order by me.minute nulls last, me.sequence
      limit $3
    `,
    [id, eventType, EVENT_LIMIT],
    EVENT_LIMIT,
  );

  return rows.map((row) => ({
    id: String(row.event_id),
    type: eventType,
    player: String(row.player_name ?? ""),
    team: String(row.team_name ?? ""),
    minute: toNumber(row.minute),
    outcome:
      eventType === "Pass"
        ? row.outcome === null
          ? "Complete"
          : String(row.outcome)
        : String(row.outcome ?? "Shot"),
    x: toNumber(row.x) ?? 0,
    y: toNumber(row.y) ?? 0,
    endX: toNumber(row.ex),
    endY: toNumber(row.ey),
    goal: String(row.outcome ?? "") === "Goal",
    xg: toNumber(row.xg),
  }));
}

async function runReadOnly(
  sql: string,
  values: unknown[],
  rowLimit: number,
): Promise<Record<string, SqlValue>[]> {
  const result = await executeSqlInReadOnlyTransaction(sql, rowLimit, TIMEOUT_MS, values);
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
