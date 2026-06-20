import type {
  Competition,
  Match,
  MatchEvent,
  MatchStatus,
  Player,
  StatsProvider,
  Team,
} from "@/lib/providers/types";

// API-Football provider. This is the licensed commercial backbone. Commercial use
// is permitted on every tier. Every API-Football specific shape, field name, and
// request detail lives only in this file. Everything outside the provider layer
// sees the neutral types in lib/providers/types.ts.
//
// Real source limitation, respected here and never papered over: API-Football does
// not provide event level pitch coordinates. So expected threat, VAEP, and expected
// goals cannot be computed from it. We map only what the source gives, goals,
// cards, substitutions and similar, and leave location, end location, body part,
// pass type, shot type, and the other coordinate or detail dependent fields
// undefined. The deep analytics stay StatsBomb only. No metric is fabricated here.
//
// The direct API is https://v3.football.api-sports.io with the x-apisports-key
// header. The RapidAPI variant is intentionally not used.

const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

// API-Football wraps every payload in this envelope. A successful call returns an
// empty errors array; a failed one (bad key, exhausted quota, bad params) returns
// a non empty errors object with HTTP 200, so it must be checked explicitly.
export type ApiFootballEnvelope<T> = {
  errors?: unknown;
  results?: number;
  paging?: { current: number; total: number };
  response: T[];
};

export type ApiFootballTransport = (
  endpoint: string,
  params: Record<string, string>,
) => Promise<ApiFootballEnvelope<unknown>>;

export type ApiFootballProviderOptions = {
  apiKey?: string;
  // Injectable transport so unit tests can feed saved JSON through the mapping
  // without calling the live API or spending the daily request quota.
  transport?: ApiFootballTransport;
};

type ApiFootballLeague = {
  league: { id: number; name: string; type?: string };
  country?: { name?: string };
  seasons?: Array<{ year: number }>;
};

type ApiFootballTeamRef = { id: number; name: string };

type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    timezone?: string;
    referee?: string | null;
    venue?: { name?: string | null; city?: string | null };
    status?: { short?: string; long?: string };
  };
  league: { id: number; name?: string; season: number; round?: string };
  teams: { home: ApiFootballTeamRef; away: ApiFootballTeamRef };
  goals: { home: number | null; away: number | null };
};

type ApiFootballFixtureEvent = {
  time: { elapsed: number | null; extra?: number | null };
  team: ApiFootballTeamRef;
  player?: { id: number | null; name: string | null };
  assist?: { id: number | null; name: string | null };
  type: string;
  detail?: string;
  comments?: string | null;
};

type ApiFootballSquad = {
  team: ApiFootballTeamRef;
  players: Array<{
    id: number;
    name: string;
    age?: number | null;
    number?: number | null;
    position?: string | null;
  }>;
};

export class ApiFootballProvider implements StatsProvider {
  private readonly transport: ApiFootballTransport;
  private competitionsPromise?: Promise<Competition[]>;
  private readonly matchesByCompetition = new Map<string, Promise<Match[]>>();
  private readonly matchById = new Map<string, Promise<Match | null>>();
  private readonly eventsByMatch = new Map<string, Promise<MatchEvent[]>>();
  private readonly squadByTeam = new Map<string, Promise<Player[]>>();

  constructor(options: ApiFootballProviderOptions = {}) {
    this.transport =
      options.transport ?? createHttpTransport(options.apiKey);
  }

  async listCompetitions(): Promise<Competition[]> {
    this.competitionsPromise ??= this.request<ApiFootballLeague>(
      "leagues",
      {},
    ).then((leagues) => leagues.flatMap(mapLeagueToCompetitions));

    return this.competitionsPromise;
  }

  async listMatches(competitionId: string): Promise<Match[]> {
    let matchesPromise = this.matchesByCompetition.get(competitionId);

    if (matchesPromise === undefined) {
      const key = parseCompetitionKey(competitionId);
      matchesPromise = this.request<ApiFootballFixture>("fixtures", {
        league: String(key.leagueId),
        season: String(key.season),
      }).then((fixtures) => fixtures.map(mapFixtureToMatch));
      this.matchesByCompetition.set(competitionId, matchesPromise);
    }

    return matchesPromise;
  }

  async getMatch(matchId: string): Promise<Match | null> {
    let matchPromise = this.matchById.get(matchId);

    if (matchPromise === undefined) {
      matchPromise = this.request<ApiFootballFixture>("fixtures", {
        id: matchId,
      }).then((fixtures) =>
        fixtures.length > 0 ? mapFixtureToMatch(fixtures[0]) : null,
      );
      this.matchById.set(matchId, matchPromise);
    }

    return matchPromise;
  }

  async getMatchEvents(matchId: string): Promise<MatchEvent[]> {
    let eventsPromise = this.eventsByMatch.get(matchId);

    if (eventsPromise === undefined) {
      eventsPromise = this.request<ApiFootballFixtureEvent>("fixtures/events", {
        fixture: matchId,
      }).then((events) =>
        events.map((event, index) => mapFixtureEvent(matchId, index, event)),
      );
      this.eventsByMatch.set(matchId, eventsPromise);
    }

    return eventsPromise;
  }

  async listTeams(): Promise<Team[]> {
    // API-Football has no global team list, and listing teams league by league
    // would burn the daily request quota. Teams are surfaced from the fixtures
    // already retrieved in this run, the same way the StatsBomb provider derives
    // teams from matches. Each fixture payload carries full home and away team
    // objects, so this needs no extra request.
    const matchGroups = await Promise.all([
      ...this.matchesByCompetition.values(),
      ...[...this.matchById.values()].map((promise) =>
        promise.then((match) => (match === null ? [] : [match])),
      ),
    ]);

    const teams = new Map<string, Team>();
    for (const matches of matchGroups) {
      for (const match of matches) {
        teams.set(match.homeTeam.id, match.homeTeam);
        teams.set(match.awayTeam.id, match.awayTeam);
      }
    }

    return sortByName([...teams.values()]);
  }

  async listPlayers(teamId: string): Promise<Player[]> {
    let squadPromise = this.squadByTeam.get(teamId);

    if (squadPromise === undefined) {
      squadPromise = this.request<ApiFootballSquad>("players/squads", {
        team: teamId,
      }).then((squads) => mapSquadToPlayers(teamId, squads));
      this.squadByTeam.set(teamId, squadPromise);
    }

    return squadPromise;
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const envelope = await this.transport(endpoint, params);
    return unwrapResponse<T>(envelope, endpoint);
  }
}

function createHttpTransport(apiKey?: string): ApiFootballTransport {
  return async (endpoint, params) => {
    if (!apiKey) {
      throw new Error(
        "API_FOOTBALL_KEY is required for live API-Football requests.",
      );
    }

    const url = new URL(`${API_FOOTBALL_BASE_URL}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `API-Football request failed with ${response.status} for ${endpoint}.`,
      );
    }

    return (await response.json()) as ApiFootballEnvelope<unknown>;
  };
}

function unwrapResponse<T>(
  envelope: ApiFootballEnvelope<unknown>,
  endpoint: string,
): T[] {
  if (hasErrors(envelope.errors)) {
    throw new Error(
      `API-Football returned errors for ${endpoint}: ${JSON.stringify(envelope.errors)}`,
    );
  }

  return (envelope.response ?? []) as T[];
}

function hasErrors(errors: unknown): boolean {
  if (Array.isArray(errors)) {
    return errors.length > 0;
  }

  if (errors !== null && typeof errors === "object") {
    return Object.keys(errors).length > 0;
  }

  return false;
}

export function mapLeagueToCompetitions(
  league: ApiFootballLeague,
): Competition[] {
  const country = league.country?.name;

  return (league.seasons ?? []).map((season) => ({
    id: makeCompetitionKey(league.league.id, season.year),
    name: league.league.name,
    country,
    seasonName: String(season.year),
    // API-Football leagues do not reliably carry gender or youth flags, so we
    // leave them at the neutral defaults rather than guessing.
    gender: "unknown",
  }));
}

export function mapFixtureToMatch(fixture: ApiFootballFixture): Match {
  return {
    id: String(fixture.fixture.id),
    competitionId: makeCompetitionKey(
      fixture.league.id,
      fixture.league.season,
    ),
    seasonName: String(fixture.league.season),
    date: fixture.fixture.date.slice(0, 10),
    kickoffTime: extractKickoffTime(fixture.fixture.date),
    homeTeam: mapTeamRef(fixture.teams.home),
    awayTeam: mapTeamRef(fixture.teams.away),
    score: mapScore(fixture.goals),
    status: normalizeStatus(fixture.fixture.status?.short),
    stage: fixture.league.round,
    venue: fixture.fixture.venue?.name ?? undefined,
    referee: fixture.fixture.referee ?? undefined,
  };
}

export function mapFixtureEvent(
  matchId: string,
  index: number,
  event: ApiFootballFixtureEvent,
): MatchEvent {
  const minute = event.time.elapsed ?? 0;

  return {
    // API-Football events carry no id of their own, so we build a stable one
    // from the fixture id and the event order.
    id: `${matchId}:${index}`,
    matchId,
    sequence: index,
    // Period is not provided directly; it is inferred from the elapsed minute.
    period: inferPeriod(minute),
    minute,
    // API-Football reports the minute only, never the second.
    second: 0,
    type: mapEventType(event),
    teamId: String(event.team.id),
    teamName: event.team.name,
    playerId:
      event.player?.id === null || event.player?.id === undefined
        ? undefined
        : String(event.player.id),
    playerName: event.player?.name ?? undefined,
    outcome: event.detail ?? undefined,
    // Everything below depends on pitch coordinates or rich event detail that
    // API-Football does not provide. They stay undefined and are never faked.
    possessionTeamId: undefined,
    possessionTeamName: undefined,
    location: undefined,
    endLocation: undefined,
    durationSeconds: undefined,
    bodyPart: undefined,
    underPressure: undefined,
    playPattern: undefined,
    isCross: undefined,
    passType: undefined,
    shotType: undefined,
  };
}

export function mapSquadToPlayers(
  teamId: string,
  squads: ApiFootballSquad[],
): Player[] {
  const squad = squads.find((entry) => String(entry.team.id) === teamId) ??
    squads[0];

  if (squad === undefined) {
    return [];
  }

  return sortByName(
    squad.players.map((player) => ({
      id: String(player.id),
      teamId,
      name: player.name,
      jerseyNumber: player.number ?? undefined,
      positions: player.position ? [player.position] : [],
    })),
  );
}

function mapTeamRef(team: ApiFootballTeamRef): Team {
  return {
    id: String(team.id),
    name: team.name,
  };
}

function mapScore(goals: ApiFootballFixture["goals"]): Match["score"] {
  if (goals.home === null || goals.away === null) {
    return undefined;
  }

  return { home: goals.home, away: goals.away };
}

function mapEventType(event: ApiFootballFixtureEvent): string {
  const type = normalizeLabel(event.type);

  if (type === "goal") {
    return "Goal";
  }
  if (type === "card") {
    return event.detail ?? "Card";
  }
  if (type === "subst") {
    return "Substitution";
  }
  if (type === "var") {
    return "VAR";
  }

  return event.detail ?? event.type;
}

function inferPeriod(minute: number): number {
  if (minute > 105) {
    return 4;
  }
  if (minute > 90) {
    return 3;
  }
  if (minute > 45) {
    return 2;
  }
  return 1;
}

function extractKickoffTime(isoDate: string): string | undefined {
  const time = isoDate.slice(11, 19);
  return /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : undefined;
}

function normalizeStatus(short: string | undefined): MatchStatus {
  switch (short) {
    case "FT":
    case "AET":
    case "PEN":
      return "complete";
    case "NS":
    case "TBD":
      return "scheduled";
    case "PST":
    case "CANC":
    case "ABD":
    case "SUSP":
      return "postponed";
    default:
      return "unknown";
  }
}

function makeCompetitionKey(leagueId: number, season: number): string {
  return `${leagueId}:${season}`;
}

function parseCompetitionKey(value: string): {
  leagueId: number;
  season: number;
} {
  const [leagueId, season] = value.split(":").map(Number);

  if (!Number.isInteger(leagueId) || !Number.isInteger(season)) {
    throw new Error(
      "Competition id is not valid for API-Football. Expected leagueId:season.",
    );
  }

  return { leagueId, season };
}

function normalizeLabel(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function sortByName<T extends { name: string }>(values: T[]): T[] {
  return values.toSorted((left, right) => left.name.localeCompare(right.name));
}
