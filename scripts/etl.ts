import { getProvider } from "../lib/providers";
import type {
  Competition,
  Match,
  MatchEvent,
  Player,
  Team,
} from "../lib/providers";
import { config } from "../lib/config/env";

const BATCH_SIZE = 1_000;

const TABLES = [
  "competitions",
  "teams",
  "players",
  "player_teams",
  "matches",
  "match_events",
] as const;

type TableName = (typeof TABLES)[number];
type RowCounts = Record<TableName, number>;

type CompetitionRow = {
  competition_id: string;
  name: string;
  country: string | null;
  season_name: string | null;
  gender: string;
  is_international: boolean;
  is_youth: boolean;
};

type TeamRow = {
  team_id: string;
  name: string;
  country: string | null;
  gender: string;
  group_name: string | null;
};

type PlayerRow = {
  player_id: string;
  name: string;
  display_name: string | null;
  country: string | null;
};

type PlayerTeamRow = {
  player_id: string;
  team_id: string;
  jersey_number: number | null;
  positions: string[];
};

type MatchRow = {
  match_id: string;
  competition_id: string;
  season_name: string | null;
  match_date: string;
  kickoff_time: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  match_week: number | null;
  stage: string | null;
  venue: string | null;
  referee: string | null;
};

type MatchEventRow = {
  event_id: string;
  match_id: string;
  sequence: number;
  period: number;
  minute: number;
  second: number;
  type: string;
  team_id: string | null;
  team_name: string | null;
  player_id: string | null;
  player_name: string | null;
  possession_team_id: string | null;
  possession_team_name: string | null;
  location_x: number | null;
  location_y: number | null;
  end_location_x: number | null;
  end_location_y: number | null;
  duration_seconds: number | null;
  outcome: string | null;
  body_part: string | null;
  under_pressure: boolean | null;
  play_pattern: string | null;
  is_cross: boolean | null;
  pass_type: string | null;
  shot_type: string | null;
};

let supabaseServiceClientPromise:
  | Promise<typeof import("../lib/supabase/server").supabaseServiceClient>
  | undefined;

async function main(): Promise<void> {
  const listCompetitions = process.argv.includes("--list-competitions");
  const verifyIdempotency = process.argv.includes("--verify-idempotency");

  if (listCompetitions) {
    const provider = getProvider();
    const competitions = await provider.listCompetitions();
    printAvailableCompetitions(competitions);
    return;
  }

  const firstRun = await runEtl();

  if (!verifyIdempotency) {
    return;
  }

  console.log("Running ETL a second time to verify idempotency.");
  const secondRun = await runEtl();
  assertCountsMatch(firstRun, secondRun);
  console.log("Idempotency check passed. Row counts were unchanged.");
}

async function runEtl(): Promise<RowCounts> {
  const provider = getProvider();

  console.log("Fetching competitions.");
  const competitions = filterCompetitions(
    await provider.listCompetitions(),
    config.etlCompetitionIds,
  );
  await upsertRows(
    "competitions",
    competitions.map(toCompetitionRow),
    "competition_id",
  );

  console.log("Fetching matches.");
  const matches = await listMatches(provider, competitions);
  const teams = collectTeams(matches);
  await upsertRows("teams", [...teams.values()], "team_id");
  await upsertRows("matches", matches.map(toMatchRow), "match_id");

  console.log("Fetching players.");
  const players = await listPlayers(provider, [...teams.keys()]);
  await upsertRows("players", [...players.players.values()], "player_id");
  await upsertRows(
    "player_teams",
    [...players.playerTeams.values()],
    "player_id,team_id",
  );

  console.log("Fetching and loading match events.");
  for (const match of matches) {
    const events = await provider.getMatchEvents(match.id);
    await loadEventDependencies(events);
    await upsertRows("match_events", events.map(toMatchEventRow), "event_id");
  }

  const counts = await getRowCounts();
  printSummary(counts);

  return counts;
}

function filterCompetitions(
  competitions: Competition[],
  allowedIds: string[],
): Competition[] {
  if (allowedIds.length === 0) {
    return competitions;
  }

  const allowedIdSet = new Set(allowedIds);
  const filtered = competitions.filter((competition) =>
    allowedIdSet.has(competition.id),
  );
  const matchedIds = new Set(filtered.map((competition) => competition.id));
  const unmatchedIds = allowedIds.filter((id) => !matchedIds.has(id));

  if (filtered.length === 0) {
    throw new Error(
      `No requested competitions were found. Unmatched ids: ${unmatchedIds.join(", ")}`,
    );
  }

  if (unmatchedIds.length > 0) {
    console.warn(
      `Warning: some requested competition ids were not found: ${unmatchedIds.join(", ")}`,
    );
  }

  console.log(
    `Competition allowlist active. Loading ${filtered.length} of ${competitions.length} competitions.`,
  );

  return filtered;
}

function printAvailableCompetitions(competitions: Competition[]): void {
  for (const competition of competitions) {
    const season = competition.seasonName ?? "unknown season";
    console.log(`${competition.id}\t${competition.name}\t${season}`);
  }
}

async function listMatches(
  provider: ReturnType<typeof getProvider>,
  competitions: Competition[],
): Promise<Match[]> {
  const matches: Match[] = [];

  for (const competition of competitions) {
    matches.push(...(await provider.listMatches(competition.id)));
  }

  return matches;
}

async function listPlayers(
  provider: ReturnType<typeof getProvider>,
  teamIds: string[],
): Promise<{
  players: Map<string, PlayerRow>;
  playerTeams: Map<string, PlayerTeamRow>;
}> {
  const players = new Map<string, PlayerRow>();
  const playerTeams = new Map<string, PlayerTeamRow>();

  for (const teamId of teamIds) {
    const teamPlayers = await provider.listPlayers(teamId);

    for (const player of teamPlayers) {
      mergePlayer(players, toPlayerRow(player));
      mergePlayerTeam(playerTeams, toPlayerTeamRow(player));
    }
  }

  return { players, playerTeams };
}

async function loadEventDependencies(events: MatchEvent[]): Promise<void> {
  const teams = new Map<string, TeamRow>();
  const players = new Map<string, PlayerRow>();
  const playerTeams = new Map<string, PlayerTeamRow>();

  for (const event of events) {
    if (event.teamId !== undefined) {
      teams.set(event.teamId, toFallbackTeamRow(event.teamId, event.teamName));
    }

    if (event.possessionTeamId !== undefined) {
      teams.set(
        event.possessionTeamId,
        toFallbackTeamRow(event.possessionTeamId, event.possessionTeamName),
      );
    }

    if (event.playerId !== undefined) {
      mergePlayer(
        players,
        toFallbackPlayerRow(event.playerId, event.playerName),
      );

      if (event.teamId !== undefined) {
        mergePlayerTeam(
          playerTeams,
          toFallbackPlayerTeamRow(event.playerId, event.teamId),
        );
      }
    }
  }

  await upsertRows("teams", [...teams.values()], "team_id", true);
  await upsertRows("players", [...players.values()], "player_id", true);
  await upsertRows(
    "player_teams",
    [...playerTeams.values()],
    "player_id,team_id",
    true,
  );
}

async function upsertRows(
  table: TableName,
  rows: Record<string, unknown>[],
  onConflict: string,
  ignoreDuplicates = false,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const supabaseServiceClient = await getSupabaseServiceClient();
    const { error } = await supabaseServiceClient
      .from(table)
      .upsert(batch as never[], { onConflict, ignoreDuplicates });

    if (error !== null) {
      throw new Error(`Failed to upsert ${table}: ${error.message}`);
    }
  }
}

async function getRowCounts(): Promise<RowCounts> {
  const counts = {} as RowCounts;
  const supabaseServiceClient = await getSupabaseServiceClient();

  for (const table of TABLES) {
    const { count, error } = await supabaseServiceClient
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error !== null) {
      throw new Error(`Failed to count ${table}: ${error.message}`);
    }

    counts[table] = count ?? 0;
  }

  return counts;
}

async function getSupabaseServiceClient(): Promise<
  typeof import("../lib/supabase/server").supabaseServiceClient
> {
  supabaseServiceClientPromise ??= import("../lib/supabase/server").then(
    (module) => module.supabaseServiceClient,
  );

  return supabaseServiceClientPromise;
}

function collectTeams(matches: Match[]): Map<string, TeamRow> {
  const teams = new Map<string, TeamRow>();

  for (const match of matches) {
    teams.set(match.homeTeam.id, toTeamRow(match.homeTeam));
    teams.set(match.awayTeam.id, toTeamRow(match.awayTeam));
  }

  return teams;
}

function toCompetitionRow(competition: Competition): CompetitionRow {
  return {
    competition_id: competition.id,
    name: competition.name,
    country: nullable(competition.country),
    season_name: nullable(competition.seasonName),
    gender: competition.gender ?? "unknown",
    is_international: competition.isInternational ?? false,
    is_youth: competition.isYouth ?? false,
  };
}

function toTeamRow(team: Team): TeamRow {
  return {
    team_id: team.id,
    name: team.name,
    country: nullable(team.country),
    gender: team.gender ?? "unknown",
    group_name: nullable(team.group),
  };
}

function toFallbackTeamRow(
  teamId: string,
  teamName: string | undefined,
): TeamRow {
  return {
    team_id: teamId,
    name: teamName ?? teamId,
    country: null,
    gender: "unknown",
    group_name: null,
  };
}

function toPlayerRow(player: Player): PlayerRow {
  return {
    player_id: player.id,
    name: player.name,
    display_name: nullable(player.displayName),
    country: nullable(player.country),
  };
}

function toFallbackPlayerRow(
  playerId: string,
  playerName: string | undefined,
): PlayerRow {
  return {
    player_id: playerId,
    name: playerName ?? playerId,
    display_name: null,
    country: null,
  };
}

function toPlayerTeamRow(player: Player): PlayerTeamRow {
  return {
    player_id: player.id,
    team_id: player.teamId,
    jersey_number: player.jerseyNumber ?? null,
    positions: player.positions ?? [],
  };
}

function toFallbackPlayerTeamRow(
  playerId: string,
  teamId: string,
): PlayerTeamRow {
  return {
    player_id: playerId,
    team_id: teamId,
    jersey_number: null,
    positions: [],
  };
}

function toMatchRow(match: Match): MatchRow {
  return {
    match_id: match.id,
    competition_id: match.competitionId,
    season_name: nullable(match.seasonName),
    match_date: match.date,
    kickoff_time: nullable(match.kickoffTime),
    home_team_id: match.homeTeam.id,
    away_team_id: match.awayTeam.id,
    home_score: match.score?.home ?? null,
    away_score: match.score?.away ?? null,
    status: match.status ?? "unknown",
    match_week: match.matchWeek ?? null,
    stage: nullable(match.stage),
    venue: nullable(match.venue),
    referee: nullable(match.referee),
  };
}

function toMatchEventRow(event: MatchEvent): MatchEventRow {
  return {
    event_id: event.id,
    match_id: event.matchId,
    sequence: event.sequence,
    period: event.period,
    minute: event.minute,
    second: event.second,
    type: event.type,
    team_id: nullable(event.teamId),
    team_name: nullable(event.teamName),
    player_id: nullable(event.playerId),
    player_name: nullable(event.playerName),
    possession_team_id: nullable(event.possessionTeamId),
    possession_team_name: nullable(event.possessionTeamName),
    location_x: event.location?.x ?? null,
    location_y: event.location?.y ?? null,
    end_location_x: event.endLocation?.x ?? null,
    end_location_y: event.endLocation?.y ?? null,
    duration_seconds: event.durationSeconds ?? null,
    outcome: nullable(event.outcome),
    body_part: nullable(event.bodyPart),
    under_pressure: event.underPressure ?? null,
    play_pattern: nullable(event.playPattern),
    is_cross: event.isCross ?? null,
    pass_type: nullable(event.passType),
    shot_type: nullable(event.shotType),
  };
}

function mergePlayer(players: Map<string, PlayerRow>, player: PlayerRow): void {
  const existing = players.get(player.player_id);

  players.set(player.player_id, {
    player_id: player.player_id,
    name: player.name,
    display_name: player.display_name ?? existing?.display_name ?? null,
    country: player.country ?? existing?.country ?? null,
  });
}

function mergePlayerTeam(
  playerTeams: Map<string, PlayerTeamRow>,
  playerTeam: PlayerTeamRow,
): void {
  const key = `${playerTeam.player_id}:${playerTeam.team_id}`;
  const existing = playerTeams.get(key);

  playerTeams.set(key, {
    player_id: playerTeam.player_id,
    team_id: playerTeam.team_id,
    jersey_number: playerTeam.jersey_number ?? existing?.jersey_number ?? null,
    positions: unique([
      ...(existing?.positions ?? []),
      ...playerTeam.positions,
    ]),
  });
}

function assertCountsMatch(firstRun: RowCounts, secondRun: RowCounts): void {
  const differences = TABLES.filter(
    (table) => firstRun[table] !== secondRun[table],
  );

  if (differences.length === 0) {
    return;
  }

  const detail = differences
    .map((table) => `${table}: ${firstRun[table]} then ${secondRun[table]}`)
    .join(", ");

  throw new Error(`Idempotency check failed. Row count changes: ${detail}`);
}

function printSummary(counts: RowCounts): void {
  console.log("Loaded row counts:");

  for (const table of TABLES) {
    console.log(`${table}: ${counts[table]}`);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function nullable(value: string | undefined): string | null {
  return value ?? null;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
