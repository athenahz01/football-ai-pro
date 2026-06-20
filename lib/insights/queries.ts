import "server-only";

import {
  availableMetrics,
  isMetricAvailable,
  type EntityType,
  type MetricKey,
} from "@/lib/insights/metrics";
import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import type { SqlValue } from "@/lib/sql/types";

// Fixed, parameterized, read only queries for comparison and scouting. Every query
// here is written by us, not by the language model, and runs through the read only
// transaction with a statement timeout. None of this uses the trusted write path or
// model written SQL. The numbers come straight from the database.

const TIMEOUT_MS = 5_000;

export type CompetitionRow = {
  id: string;
  name: string;
  seasonName: string | null;
  source: string;
};

export type EntityRow = {
  id: string;
  name: string;
};

export type EntityMetrics = {
  name: string;
  source: string;
  values: Partial<Record<MetricKey, number>>;
};

export type LeaderboardRow = {
  rank: number;
  name: string;
  value: number;
  shots: number | null;
};

const TOTALS_COLUMN: Record<string, string> = {
  xt: "total_xt",
  vaep: "total_vaep",
  xg: "total_xg",
  shots: "shot_count",
};

export async function listCompetitions(): Promise<CompetitionRow[]> {
  const result = await runReadOnly(
    `
      select competition_id, name, season_name, source
      from competitions
      order by name, season_name
    `,
    [],
    100,
  );

  return result.map((row) => ({
    id: String(row.competition_id),
    name: String(row.name),
    seasonName: row.season_name === null ? null : String(row.season_name),
    source: String(row.source),
  }));
}

export async function getCompetition(
  competitionId: string,
): Promise<CompetitionRow | null> {
  const result = await runReadOnly(
    `
      select competition_id, name, season_name, source
      from competitions
      where competition_id = $1
    `,
    [competitionId],
    1,
  );

  if (result.length === 0) {
    return null;
  }

  const row = result[0];
  return {
    id: String(row.competition_id),
    name: String(row.name),
    seasonName: row.season_name === null ? null : String(row.season_name),
    source: String(row.source),
  };
}

export async function listEntities(
  competitionId: string,
  entityType: EntityType,
): Promise<EntityRow[]> {
  const sql =
    entityType === "players"
      ? `
        select player_id as id, player_name as name
        from player_metric_totals
        where competition_id = $1
        order by player_name
      `
      : `
        select distinct t.team_id as id, t.name as name
        from teams t
        join matches m
          on m.home_team_id = t.team_id or m.away_team_id = t.team_id
        where m.competition_id = $1
        order by t.name
      `;

  const result = await runReadOnly(sql, [competitionId], 1_000);
  return result.map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function getEntityMetrics(
  competition: CompetitionRow,
  entityType: EntityType,
  entityId: string,
): Promise<EntityMetrics | null> {
  const available = availableMetrics(competition.source, entityType);

  if (entityType === "players" && competition.source === "statsbomb") {
    return readStatsBombPlayer(competition.id, entityId, available);
  }

  if (entityType === "teams" && competition.source === "statsbomb") {
    return readStatsBombTeam(competition.id, entityId, available);
  }

  if (entityType === "teams" && competition.source === "api_football") {
    return readApiFootballTeam(competition.id, entityId);
  }

  return null;
}

async function readStatsBombPlayer(
  competitionId: string,
  playerId: string,
  available: MetricKey[],
): Promise<EntityMetrics | null> {
  const result = await runReadOnly(
    `
      select
        pmt.player_name as name,
        pmt.total_xt as xt,
        pmt.total_vaep as vaep,
        pmt.total_xg as xg,
        pmt.shot_count as shots,
        (
          select count(*) from match_events me
          where me.player_id = $1 and me.type = 'Shot' and me.outcome = 'Goal'
            and me.match_id in (select match_id from matches where competition_id = $2)
        ) as goals,
        (
          select count(*) from match_events me
          where me.player_id = $1 and me.type = 'Pass'
            and me.match_id in (select match_id from matches where competition_id = $2)
        ) as passes
      from player_metric_totals pmt
      where pmt.player_id = $1 and pmt.competition_id = $2
    `,
    [playerId, competitionId],
    1,
  );

  if (result.length === 0) {
    return null;
  }

  return toEntityMetrics(result[0], "statsbomb", available);
}

async function readStatsBombTeam(
  competitionId: string,
  teamId: string,
  available: MetricKey[],
): Promise<EntityMetrics | null> {
  const result = await runReadOnly(
    `
      select
        tmt.team_name as name,
        tmt.total_xt as xt,
        tmt.total_vaep as vaep,
        tmt.total_xg as xg,
        tmt.shot_count as shots,
        (
          select count(*) from match_events me
          where me.team_id = $1 and me.type = 'Shot' and me.outcome = 'Goal'
            and me.match_id in (select match_id from matches where competition_id = $2)
        ) as goals,
        (
          select count(*) from match_events me
          where me.team_id = $1 and me.type = 'Pass'
            and me.match_id in (select match_id from matches where competition_id = $2)
        ) as passes
      from team_metric_totals tmt
      where tmt.team_id = $1 and tmt.competition_id = $2
    `,
    [teamId, competitionId],
    1,
  );

  if (result.length === 0) {
    return null;
  }

  return toEntityMetrics(result[0], "statsbomb", available);
}

async function readApiFootballTeam(
  competitionId: string,
  teamId: string,
): Promise<EntityMetrics | null> {
  const result = await runReadOnly(
    `
      select
        t.name as name,
        (
          select coalesce(sum(
            case when m.home_team_id = $1 then m.home_score else m.away_score end
          ), 0)
          from matches m
          where m.competition_id = $2 and (m.home_team_id = $1 or m.away_team_id = $1)
        ) as goals
      from teams t
      where t.team_id = $1
    `,
    [teamId, competitionId],
    1,
  );

  if (result.length === 0) {
    return null;
  }

  const row = result[0];
  return {
    name: String(row.name),
    source: "api_football",
    values: { goals: toNumber(row.goals) ?? 0 },
  };
}

function toEntityMetrics(
  row: Record<string, SqlValue>,
  source: string,
  available: MetricKey[],
): EntityMetrics {
  const values: Partial<Record<MetricKey, number>> = {};

  for (const key of available) {
    const value = toNumber(row[key]);
    if (value !== null) {
      values[key] = value;
    }
  }

  return { name: String(row.name), source, values };
}

export async function leaderboard(
  competition: CompetitionRow,
  entityType: EntityType,
  metric: MetricKey,
  minShots: number,
  limit: number,
): Promise<LeaderboardRow[]> {
  if (!isMetricAvailable(competition.source, entityType, metric)) {
    return [];
  }

  if (competition.source === "api_football") {
    return apiFootballTeamGoalsLeaderboard(competition.id, limit);
  }

  const totalsColumn = TOTALS_COLUMN[metric];
  const rows = totalsColumn
    ? await statsBombTotalsLeaderboard(
        entityType,
        competition.id,
        totalsColumn,
        minShots,
        limit,
      )
    : await statsBombEventLeaderboard(
        entityType,
        competition.id,
        metric,
        minShots,
        limit,
      );

  return rows.map((row, index) => ({
    rank: index + 1,
    name: String(row.name),
    value: toNumber(row.value) ?? 0,
    shots: toNumber(row.shots),
  }));
}

async function statsBombTotalsLeaderboard(
  entityType: EntityType,
  competitionId: string,
  totalsColumn: string,
  minShots: number,
  limit: number,
): Promise<Record<string, SqlValue>[]> {
  const table =
    entityType === "players" ? "player_metric_totals" : "team_metric_totals";
  const nameColumn = entityType === "players" ? "player_name" : "team_name";

  return runReadOnly(
    `
      select ${nameColumn} as name, ${totalsColumn} as value, shot_count as shots
      from ${table}
      where competition_id = $1 and shot_count >= $2
      order by ${totalsColumn} desc nulls last, ${nameColumn}
      limit $3
    `,
    [competitionId, minShots, limit],
    limit,
  );
}

async function statsBombEventLeaderboard(
  entityType: EntityType,
  competitionId: string,
  metric: MetricKey,
  minShots: number,
  limit: number,
): Promise<Record<string, SqlValue>[]> {
  const idColumn = entityType === "players" ? "player_id" : "team_id";
  const nameColumn = entityType === "players" ? "player_name" : "team_name";
  const totalsTable =
    entityType === "players" ? "player_metric_totals" : "team_metric_totals";
  const eventFilter =
    metric === "goals" ? "me.type = 'Shot' and me.outcome = 'Goal'" : "me.type = 'Pass'";

  return runReadOnly(
    `
      select
        max(me.${nameColumn}) as name,
        count(*) as value,
        coalesce(max(totals.shot_count), 0) as shots
      from match_events me
      left join ${totalsTable} totals
        on totals.${idColumn} = me.${idColumn} and totals.competition_id = $1
      where ${eventFilter}
        and me.${idColumn} is not null
        and me.match_id in (select match_id from matches where competition_id = $1)
      group by me.${idColumn}
      having coalesce(max(totals.shot_count), 0) >= $2
      order by value desc
      limit $3
    `,
    [competitionId, minShots, limit],
    limit,
  );
}

async function apiFootballTeamGoalsLeaderboard(
  competitionId: string,
  limit: number,
): Promise<LeaderboardRow[]> {
  const rows = await runReadOnly(
    `
      select t.name as name,
        sum(case when m.home_team_id = t.team_id then m.home_score else m.away_score end) as value
      from matches m
      join teams t on m.home_team_id = t.team_id or m.away_team_id = t.team_id
      where m.competition_id = $1
      group by t.name
      order by value desc
      limit $2
    `,
    [competitionId, limit],
    limit,
  );

  return rows.map((row, index) => ({
    rank: index + 1,
    name: String(row.name),
    value: toNumber(row.value) ?? 0,
    shots: null,
  }));
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
