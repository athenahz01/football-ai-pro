import type {
  Competition,
  EventBodyPart,
  Match,
  MatchEvent,
  MatchStatus,
  PassType,
  PitchLocation,
  PlayPattern,
  Player,
  ShotType,
  StatsProvider,
  Team,
  TeamGender,
} from "@/lib/providers/types";

const STATS_BOMB_OPEN_DATA_BASE_URL =
  "https://raw.githubusercontent.com/statsbomb/open-data/master/data";

type StatsBombNamedEntity = {
  id: number;
  name: string;
};

type StatsBombCountry = StatsBombNamedEntity;

type StatsBombCompetition = {
  competition_id: number;
  season_id: number;
  country_name: string;
  competition_name: string;
  competition_gender: string;
  competition_youth: boolean;
  competition_international: boolean;
  season_name: string;
};

type StatsBombMatchTeam = {
  country?: StatsBombCountry;
} & (
  | {
      home_team_id: number;
      home_team_name: string;
      home_team_gender?: string;
      home_team_group?: string | null;
    }
  | {
      away_team_id: number;
      away_team_name: string;
      away_team_gender?: string;
      away_team_group?: string | null;
    }
);

type StatsBombMatch = {
  match_id: number;
  match_date: string;
  kick_off?: string;
  competition: {
    competition_id: number;
    country_name?: string;
    competition_name?: string;
  };
  season: {
    season_id: number;
    season_name: string;
  };
  home_team: Extract<StatsBombMatchTeam, { home_team_id: number }>;
  away_team: Extract<StatsBombMatchTeam, { away_team_id: number }>;
  home_score?: number;
  away_score?: number;
  match_status?: string;
  match_week?: number;
  competition_stage?: StatsBombNamedEntity;
  stadium?: {
    name: string;
    country?: StatsBombCountry;
  };
  referee?: {
    name: string;
    country?: StatsBombCountry;
  };
};

type StatsBombLineupPlayer = {
  player_id: number;
  player_name: string;
  player_nickname?: string | null;
  jersey_number?: number;
  country?: StatsBombCountry;
  positions?: Array<{
    position: string;
  }>;
};

type StatsBombLineupTeam = {
  team_id: number;
  team_name: string;
  lineup: StatsBombLineupPlayer[];
};

type StatsBombEventDetail = {
  end_location?: number[];
  outcome?: StatsBombNamedEntity;
};

type StatsBombPassDetail = StatsBombEventDetail & {
  body_part?: StatsBombNamedEntity;
  cross?: boolean;
  type?: StatsBombNamedEntity;
};

type StatsBombShotDetail = StatsBombEventDetail & {
  body_part?: StatsBombNamedEntity;
  type?: StatsBombNamedEntity;
};

type StatsBombEvent = {
  id: string;
  index: number;
  period: number;
  minute: number;
  second: number;
  type: StatsBombNamedEntity;
  team?: StatsBombNamedEntity;
  player?: StatsBombNamedEntity;
  possession_team?: StatsBombNamedEntity;
  play_pattern?: StatsBombNamedEntity;
  under_pressure?: boolean;
  location?: number[];
  duration?: number;
  pass?: StatsBombPassDetail;
  shot?: StatsBombShotDetail;
  carry?: StatsBombEventDetail;
  dribble?: StatsBombEventDetail;
  duel?: StatsBombEventDetail;
  goalkeeper?: StatsBombEventDetail;
  interception?: StatsBombEventDetail;
  ball_receipt?: StatsBombEventDetail;
};

export class StatsBombOpenDataProvider implements StatsProvider {
  private competitionsPromise?: Promise<Competition[]>;
  private allMatchesPromise?: Promise<Match[]>;
  private readonly matchesByCompetition = new Map<string, Promise<Match[]>>();
  private readonly lineupsByMatch = new Map<
    string,
    Promise<StatsBombLineupTeam[]>
  >();

  async listCompetitions(): Promise<Competition[]> {
    this.competitionsPromise ??= fetchStatsBombJson<StatsBombCompetition[]>(
      "/competitions.json",
    ).then((competitions) => competitions.map(mapCompetition));

    return this.competitionsPromise;
  }

  async listMatches(competitionId: string): Promise<Match[]> {
    let matchesPromise = this.matchesByCompetition.get(competitionId);

    if (matchesPromise === undefined) {
      const key = parseCompetitionKey(competitionId);
      matchesPromise = fetchStatsBombJson<StatsBombMatch[]>(
        `/matches/${key.competitionId}/${key.seasonId}.json`,
      ).then((matches) => matches.map(mapMatch));
      this.matchesByCompetition.set(competitionId, matchesPromise);
    }

    return matchesPromise;
  }

  async getMatch(matchId: string): Promise<Match | null> {
    const matches = await this.listAllMatches();

    return matches.find((match) => match.id === matchId) ?? null;
  }

  async getMatchEvents(matchId: string): Promise<MatchEvent[]> {
    const events = await fetchStatsBombJson<StatsBombEvent[]>(
      `/events/${matchId}.json`,
    );

    return events.map((event) => mapEvent(matchId, event));
  }

  async listTeams(): Promise<Team[]> {
    const teams = new Map<string, Team>();
    const matches = await this.listAllMatches();

    for (const match of matches) {
      teams.set(match.homeTeam.id, match.homeTeam);
      teams.set(match.awayTeam.id, match.awayTeam);
    }

    return sortByName([...teams.values()]);
  }

  async listPlayers(teamId: string): Promise<Player[]> {
    const players = new Map<string, Player>();
    const matches = await this.listAllMatches();
    const teamMatches = matches.filter(
      (match) => match.homeTeam.id === teamId || match.awayTeam.id === teamId,
    );
    const lineups = await Promise.all(
      teamMatches.map((match) => this.listLineups(match.id)),
    );

    for (const matchLineups of lineups) {
      for (const teamLineup of matchLineups) {
        if (String(teamLineup.team_id) !== teamId) {
          continue;
        }

        for (const player of teamLineup.lineup) {
          players.set(String(player.player_id), mapPlayer(teamId, player));
        }
      }
    }

    return sortByName([...players.values()]);
  }

  private async listAllMatches(): Promise<Match[]> {
    this.allMatchesPromise ??= this.listCompetitions().then(
      async (competitions) => {
        const matchGroups = await Promise.all(
          competitions.map((competition) => this.listMatches(competition.id)),
        );

        return matchGroups.flat();
      },
    );

    return this.allMatchesPromise;
  }

  private async listLineups(matchId: string): Promise<StatsBombLineupTeam[]> {
    let lineupsPromise = this.lineupsByMatch.get(matchId);

    if (lineupsPromise === undefined) {
      lineupsPromise = fetchStatsBombJson<StatsBombLineupTeam[]>(
        `/lineups/${matchId}.json`,
      );
      this.lineupsByMatch.set(matchId, lineupsPromise);
    }

    return lineupsPromise;
  }
}

async function fetchStatsBombJson<T>(path: string): Promise<T> {
  const response = await fetch(`${STATS_BOMB_OPEN_DATA_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `StatsBomb Open Data request failed with ${response.status} for ${path}.`,
    );
  }

  return (await response.json()) as T;
}

function mapCompetition(competition: StatsBombCompetition): Competition {
  return {
    id: makeCompetitionKey(competition.competition_id, competition.season_id),
    name: competition.competition_name,
    country: competition.country_name,
    seasonName: competition.season_name,
    gender: normalizeGender(competition.competition_gender),
    isInternational: competition.competition_international,
    isYouth: competition.competition_youth,
  };
}

function mapMatch(match: StatsBombMatch): Match {
  return {
    id: String(match.match_id),
    competitionId: makeCompetitionKey(
      match.competition.competition_id,
      match.season.season_id,
    ),
    seasonName: match.season.season_name,
    date: match.match_date,
    kickoffTime: match.kick_off,
    homeTeam: mapHomeTeam(match.home_team),
    awayTeam: mapAwayTeam(match.away_team),
    score: mapScore(match),
    status: normalizeMatchStatus(match.match_status),
    matchWeek: match.match_week,
    stage: match.competition_stage?.name,
    venue: match.stadium?.name,
    referee: match.referee?.name,
  };
}

function mapHomeTeam(team: StatsBombMatch["home_team"]): Team {
  return {
    id: String(team.home_team_id),
    name: team.home_team_name,
    country: team.country?.name,
    gender: normalizeGender(team.home_team_gender),
    group: team.home_team_group ?? undefined,
  };
}

function mapAwayTeam(team: StatsBombMatch["away_team"]): Team {
  return {
    id: String(team.away_team_id),
    name: team.away_team_name,
    country: team.country?.name,
    gender: normalizeGender(team.away_team_gender),
    group: team.away_team_group ?? undefined,
  };
}

function mapScore(match: StatsBombMatch): Match["score"] {
  if (match.home_score === undefined || match.away_score === undefined) {
    return undefined;
  }

  return {
    home: match.home_score,
    away: match.away_score,
  };
}

function mapPlayer(teamId: string, player: StatsBombLineupPlayer): Player {
  return {
    id: String(player.player_id),
    teamId,
    name: player.player_name,
    displayName: player.player_nickname ?? undefined,
    country: player.country?.name,
    jerseyNumber: player.jersey_number,
    positions: unique(
      player.positions?.map((position) => position.position) ?? [],
    ),
  };
}

function mapEvent(matchId: string, event: StatsBombEvent): MatchEvent {
  const detail = getEventDetail(event);

  return {
    id: event.id,
    matchId,
    sequence: event.index,
    period: event.period,
    minute: event.minute,
    second: event.second,
    type: event.type.name,
    teamId: optionalEntityId(event.team),
    teamName: event.team?.name,
    playerId: optionalEntityId(event.player),
    playerName: event.player?.name,
    possessionTeamId: optionalEntityId(event.possession_team),
    possessionTeamName: event.possession_team?.name,
    location: mapLocation(event.location),
    endLocation: mapLocation(detail?.end_location),
    durationSeconds: event.duration,
    outcome: detail?.outcome?.name,
    bodyPart: mapBodyPart(
      event.pass?.body_part?.name ?? event.shot?.body_part?.name,
    ),
    underPressure: event.under_pressure,
    playPattern: mapPlayPattern(event.play_pattern?.name),
    isCross: event.pass === undefined ? undefined : (event.pass.cross ?? false),
    passType: mapPassType(event.pass),
    shotType: mapShotType(event.shot),
  };
}

function getEventDetail(
  event: StatsBombEvent,
): StatsBombEventDetail | undefined {
  return (
    event.pass ??
    event.shot ??
    event.carry ??
    event.dribble ??
    event.duel ??
    event.goalkeeper ??
    event.interception ??
    event.ball_receipt
  );
}

function mapBodyPart(value: string | undefined): EventBodyPart | undefined {
  switch (normalizeProviderLabel(value)) {
    case "left foot":
      return "left_foot";
    case "right foot":
      return "right_foot";
    case "head":
      return "head";
    case "keeper arm":
    case "keeper hand":
    case "keeper hands":
      return "keeper_hands";
    case "no touch":
    case "other":
      return "other";
    default:
      return undefined;
  }
}

function mapPlayPattern(value: string | undefined): PlayPattern | undefined {
  switch (normalizeProviderLabel(value)) {
    case "regular play":
      return "regular_play";
    case "from corner":
      return "from_corner";
    case "from free kick":
      return "from_free_kick";
    case "from throw in":
      return "from_throw_in";
    case "from goal kick":
      return "from_goal_kick";
    case "from kick off":
      return "from_kick_off";
    case "from counter":
      return "from_counter";
    case "from keeper":
      return "from_keeper";
    case "other":
      return "other";
    default:
      return undefined;
  }
}

function mapPassType(
  pass: StatsBombPassDetail | undefined,
): PassType | undefined {
  if (pass === undefined) {
    return undefined;
  }

  switch (normalizeProviderLabel(pass.type?.name)) {
    case "":
      return "open_play";
    case "corner":
      return "corner";
    case "free kick":
      return "free_kick";
    case "throw in":
      return "throw_in";
    case "goal kick":
      return "goal_kick";
    case "kick off":
      return "kick_off";
    default:
      return undefined;
  }
}

function mapShotType(
  shot: StatsBombShotDetail | undefined,
): ShotType | undefined {
  if (shot === undefined) {
    return undefined;
  }

  switch (normalizeProviderLabel(shot.type?.name)) {
    case "":
    case "open play":
      return "open_play";
    case "penalty":
      return "penalty";
    case "free kick":
      return "free_kick";
    case "corner":
      return "corner";
    default:
      return undefined;
  }
}

function mapLocation(value: number[] | undefined): PitchLocation | undefined {
  if (value === undefined || value.length < 2) {
    return undefined;
  }

  return {
    x: value[0],
    y: value[1],
  };
}

function normalizeGender(value: string | undefined): TeamGender {
  if (value === "female" || value === "male" || value === "mixed") {
    return value;
  }

  return "unknown";
}

function normalizeMatchStatus(value: string | undefined): MatchStatus {
  if (
    value === "available" ||
    value === "complete" ||
    value === "postponed" ||
    value === "scheduled"
  ) {
    return value;
  }

  return "unknown";
}

function normalizeProviderLabel(value: string | undefined): string {
  return (
    value
      ?.replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .toLowerCase() ?? ""
  );
}

function makeCompetitionKey(competitionId: number, seasonId: number): string {
  return `${competitionId}:${seasonId}`;
}

function parseCompetitionKey(value: string): {
  competitionId: number;
  seasonId: number;
} {
  const [competitionId, seasonId] = value.split(":").map(Number);

  if (!Number.isInteger(competitionId) || !Number.isInteger(seasonId)) {
    throw new Error("Competition id is not valid for StatsBomb Open Data.");
  }

  return { competitionId, seasonId };
}

function optionalEntityId(
  entity: StatsBombNamedEntity | undefined,
): string | undefined {
  return entity === undefined ? undefined : String(entity.id);
}

function sortByName<T extends { name: string }>(values: T[]): T[] {
  return values.toSorted((left, right) => left.name.localeCompare(right.name));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
