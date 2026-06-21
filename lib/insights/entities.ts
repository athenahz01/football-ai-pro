import "server-only";

import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import type { SqlValue } from "@/lib/sql/types";

// Fixed, parameterized, read only queries for entity profiles and the home screen.
// Every query here is written by us, not by the language model, and runs through the
// read only transaction with a statement timeout, the same approach as lib/insights
// queries. None of this uses the trusted write path or model written SQL. The numbers
// come straight from the database, and where a feed lacks a metric the value is null,
// which the UI shows as not available rather than zero.

const TIMEOUT_MS = 5_000;
const SHOT_LIMIT = 400;

export type EntityKind = "player" | "team";

export type FeaturedEntity = {
  kind: EntityKind;
  id: string;
  name: string;
  source: string;
  competitionId: string;
  metricLabel: string;
  metricValue: number;
  display: string;
};

export type ShotPoint = {
  x: number;
  y: number;
  goal: boolean;
};

export type MatchResult = {
  matchId: string;
  date: string | null;
  opponent: string;
  home: boolean;
  scoreFor: number | null;
  scoreAgainst: number | null;
  result: "W" | "D" | "L" | null;
};

export type ProfileStats = {
  xt: number | null;
  vaep: number | null;
  xg: number | null;
  shots: number | null;
  goals: number | null;
  passes: number | null;
};

export type PlayerProfile = {
  kind: "player";
  id: string;
  name: string;
  source: string;
  competitionId: string;
  competitionName: string | null;
  teamName: string | null;
  country: string | null;
  stats: ProfileStats;
  shots: ShotPoint[];
};

export type TeamProfile = {
  kind: "team";
  id: string;
  name: string;
  source: string;
  competitionId: string;
  competitionName: string | null;
  country: string | null;
  stats: ProfileStats;
  recentMatches: MatchResult[];
  shots: ShotPoint[];
};

export async function featuredPlayers(limit = 6): Promise<FeaturedEntity[]> {
  const rows = await runReadOnly(
    `
      select player_id as id, player_name as name, competition_id, source, total_xg
      from player_metric_totals
      where total_xg is not null
      order by total_xg desc nulls last, player_name
      limit $1
    `,
    [limit],
    limit,
  );
  return rows.map((row) => ({
    kind: "player" as const,
    id: String(row.id),
    name: String(row.name),
    source: String(row.source),
    competitionId: String(row.competition_id),
    metricLabel: "Expected goals",
    metricValue: toNumber(row.total_xg) ?? 0,
    display: (toNumber(row.total_xg) ?? 0).toFixed(2),
  }));
}

export async function featuredTeams(limit = 6): Promise<FeaturedEntity[]> {
  const rows = await runReadOnly(
    `
      select team_id as id, team_name as name, competition_id, source, total_xg
      from team_metric_totals
      where total_xg is not null
      order by total_xg desc nulls last, team_name
      limit $1
    `,
    [limit],
    limit,
  );
  return rows.map((row) => ({
    kind: "team" as const,
    id: String(row.id),
    name: String(row.name),
    source: String(row.source),
    competitionId: String(row.competition_id),
    metricLabel: "Expected goals",
    metricValue: toNumber(row.total_xg) ?? 0,
    display: (toNumber(row.total_xg) ?? 0).toFixed(2),
  }));
}

export type EntityCardData = {
  kind: EntityKind;
  id: string;
  name: string;
  metricLabel: string;
  display: string | null;
};

// Card data for a set of followed entities, batched into one query per kind. Used by
// the home screen so it can show a follower's teams and players as cards with a key
// number. An entity with no expected goals in the feed shows no number rather than a
// fabricated zero.
export async function cardsForFollows(
  players: { id: string; name: string }[],
  teams: { id: string; name: string }[],
): Promise<EntityCardData[]> {
  const cards: EntityCardData[] = [];

  if (players.length > 0) {
    const rows = await runReadOnly(
      `select player_id as id, total_xg from player_metric_totals where player_id = any($1)`,
      [players.map((player) => player.id)],
      players.length,
    );
    const xg = new Map(rows.map((row) => [String(row.id), toNumber(row.total_xg)]));
    for (const player of players) {
      const value = xg.get(player.id) ?? null;
      cards.push({
        kind: "player",
        id: player.id,
        name: player.name,
        metricLabel: "Expected goals",
        display: value === null ? null : value.toFixed(2),
      });
    }
  }

  if (teams.length > 0) {
    const rows = await runReadOnly(
      `select team_id as id, total_xg from team_metric_totals where team_id = any($1)`,
      [teams.map((team) => team.id)],
      teams.length,
    );
    const xg = new Map(rows.map((row) => [String(row.id), toNumber(row.total_xg)]));
    for (const team of teams) {
      const value = xg.get(team.id) ?? null;
      cards.push({
        kind: "team",
        id: team.id,
        name: team.name,
        metricLabel: "Expected goals",
        display: value === null ? null : value.toFixed(2),
      });
    }
  }

  return cards;
}

export type ResolvedEntity = { name: string; kind: EntityKind; id: string };

// Resolve answer entity names to their profile, so a name in an answer can become a
// tappable chip. Exact name match only, players preferred, to avoid linking to the
// wrong entity. A name that does not resolve is left as plain text by the caller.
export async function resolveEntities(
  names: string[],
): Promise<ResolvedEntity[]> {
  const unique = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (unique.length === 0) {
    return [];
  }

  const rows = await runReadOnly(
    `
      select 'player' as kind, player_id as id, name from players where name = any($1)
      union all
      select 'team' as kind, team_id as id, name from teams where name = any($1)
    `,
    [unique],
    unique.length * 2,
  );

  const byName = new Map<string, ResolvedEntity>();
  for (const row of rows) {
    const name = String(row.name);
    const kind = String(row.kind) as EntityKind;
    // Players are inserted first by the union, so a player match wins on collision.
    if (!byName.has(name)) {
      byName.set(name, { name, kind, id: String(row.id) });
    }
  }

  return Array.from(byName.values());
}

export async function getPlayerProfile(
  playerId: string,
): Promise<PlayerProfile | null> {
  const rows = await runReadOnly(
    `
      select
        pmt.player_id,
        pmt.player_name,
        pmt.competition_id,
        pmt.source,
        pmt.total_xt,
        pmt.total_vaep,
        pmt.total_xg,
        pmt.shot_count,
        c.name as competition_name,
        p.country,
        (
          select t.name from player_teams pt
          join teams t on t.team_id = pt.team_id
          where pt.player_id = pmt.player_id
          limit 1
        ) as team_name,
        (
          select count(*) from match_events me
          where me.player_id = pmt.player_id and me.type = 'Shot' and me.outcome = 'Goal'
            and me.match_id in (select match_id from matches where competition_id = pmt.competition_id)
        ) as goals,
        (
          select count(*) from match_events me
          where me.player_id = pmt.player_id and me.type = 'Pass'
            and me.match_id in (select match_id from matches where competition_id = pmt.competition_id)
        ) as passes
      from player_metric_totals pmt
      left join competitions c on c.competition_id = pmt.competition_id
      left join players p on p.player_id = pmt.player_id
      where pmt.player_id = $1
      limit 1
    `,
    [playerId],
    1,
  );

  if (rows.length === 0) {
    return null;
  }
  const row = rows[0];
  const shots = await getPlayerShots(playerId);

  return {
    kind: "player",
    id: String(row.player_id),
    name: String(row.player_name),
    source: String(row.source),
    competitionId: String(row.competition_id),
    competitionName: row.competition_name ? String(row.competition_name) : null,
    teamName: row.team_name ? String(row.team_name) : null,
    country: row.country ? String(row.country) : null,
    stats: {
      xt: toNumber(row.total_xt),
      vaep: toNumber(row.total_vaep),
      xg: toNumber(row.total_xg),
      shots: toNumber(row.shot_count),
      goals: toNumber(row.goals),
      passes: toNumber(row.passes),
    },
    shots,
  };
}

export async function getTeamProfile(teamId: string): Promise<TeamProfile | null> {
  const rows = await runReadOnly(
    `
      select
        tmt.team_id,
        tmt.team_name,
        tmt.competition_id,
        tmt.source,
        tmt.total_xt,
        tmt.total_vaep,
        tmt.total_xg,
        tmt.shot_count,
        c.name as competition_name,
        t.country,
        (
          select count(*) from match_events me
          where me.team_id = tmt.team_id and me.type = 'Shot' and me.outcome = 'Goal'
            and me.match_id in (select match_id from matches where competition_id = tmt.competition_id)
        ) as goals,
        (
          select count(*) from match_events me
          where me.team_id = tmt.team_id and me.type = 'Pass'
            and me.match_id in (select match_id from matches where competition_id = tmt.competition_id)
        ) as passes
      from team_metric_totals tmt
      left join competitions c on c.competition_id = tmt.competition_id
      left join teams t on t.team_id = tmt.team_id
      where tmt.team_id = $1
      limit 1
    `,
    [teamId],
    1,
  );

  if (rows.length === 0) {
    return null;
  }
  const row = rows[0];
  const [recentMatches, shots] = await Promise.all([
    getTeamMatches(teamId),
    getTeamShots(teamId),
  ]);

  return {
    kind: "team",
    id: String(row.team_id),
    name: String(row.team_name),
    source: String(row.source),
    competitionId: String(row.competition_id),
    competitionName: row.competition_name ? String(row.competition_name) : null,
    country: row.country ? String(row.country) : null,
    stats: {
      xt: toNumber(row.total_xt),
      vaep: toNumber(row.total_vaep),
      xg: toNumber(row.total_xg),
      shots: toNumber(row.shot_count),
      goals: toNumber(row.goals),
      passes: toNumber(row.passes),
    },
    recentMatches,
    shots,
  };
}

async function getPlayerShots(playerId: string): Promise<ShotPoint[]> {
  const rows = await runReadOnly(
    `
      select location_x, location_y, outcome
      from match_events
      where player_id = $1 and type = 'Shot'
        and location_x is not null and location_y is not null
      limit $2
    `,
    [playerId, SHOT_LIMIT],
    SHOT_LIMIT,
  );
  return rows.map(toShotPoint);
}

async function getTeamShots(teamId: string): Promise<ShotPoint[]> {
  const rows = await runReadOnly(
    `
      select location_x, location_y, outcome
      from match_events
      where team_id = $1 and type = 'Shot'
        and location_x is not null and location_y is not null
      limit $2
    `,
    [teamId, SHOT_LIMIT],
    SHOT_LIMIT,
  );
  return rows.map(toShotPoint);
}

async function getTeamMatches(teamId: string): Promise<MatchResult[]> {
  const rows = await runReadOnly(
    `
      select
        m.match_id,
        m.match_date,
        m.home_team_id,
        m.away_team_id,
        m.home_score,
        m.away_score,
        ht.name as home_name,
        at.name as away_name
      from matches m
      left join teams ht on ht.team_id = m.home_team_id
      left join teams at on at.team_id = m.away_team_id
      where m.home_team_id = $1 or m.away_team_id = $1
      order by m.match_date desc nulls last
      limit 5
    `,
    [teamId],
    5,
  );

  return rows.map((row) => {
    const home = String(row.home_team_id) === teamId;
    const scoreFor = toNumber(home ? row.home_score : row.away_score);
    const scoreAgainst = toNumber(home ? row.away_score : row.home_score);
    let result: MatchResult["result"] = null;
    if (scoreFor !== null && scoreAgainst !== null) {
      result = scoreFor > scoreAgainst ? "W" : scoreFor < scoreAgainst ? "L" : "D";
    }
    return {
      matchId: String(row.match_id),
      date: row.match_date ? String(row.match_date) : null,
      opponent: String((home ? row.away_name : row.home_name) ?? "Unknown"),
      home,
      scoreFor,
      scoreAgainst,
      result,
    };
  });
}

function toShotPoint(row: Record<string, SqlValue>): ShotPoint {
  return {
    x: toNumber(row.location_x) ?? 0,
    y: toNumber(row.location_y) ?? 0,
    goal: String(row.outcome ?? "") === "Goal",
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
