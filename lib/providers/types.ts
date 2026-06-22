export type DataProviderId = "statsbomb_open" | "api_football";

export type TeamGender = "female" | "male" | "mixed" | "unknown";

export type MatchStatus =
  | "available"
  | "complete"
  | "postponed"
  | "scheduled"
  | "unknown";

export type EventBodyPart =
  | "left_foot"
  | "right_foot"
  | "head"
  | "other"
  | "keeper_hands";

export type PlayPattern =
  | "regular_play"
  | "from_corner"
  | "from_free_kick"
  | "from_throw_in"
  | "from_goal_kick"
  | "from_kick_off"
  | "from_counter"
  | "from_keeper"
  | "other";

export type PassType =
  | "open_play"
  | "corner"
  | "free_kick"
  | "throw_in"
  | "goal_kick"
  | "kick_off";

export type ShotType = "open_play" | "penalty" | "free_kick" | "corner";

export type PitchLocation = {
  x: number;
  y: number;
};

export type ShotFreezeFramePlayer = {
  location: PitchLocation;
  teammate: boolean;
  position?: string;
  actor?: boolean;
};

export type Team = {
  id: string;
  name: string;
  country?: string;
  gender?: TeamGender;
  group?: string;
};

export type Player = {
  id: string;
  teamId: string;
  name: string;
  displayName?: string;
  country?: string;
  jerseyNumber?: number;
  positions?: string[];
};

export type Competition = {
  id: string;
  name: string;
  country?: string;
  seasonName?: string;
  gender?: TeamGender;
  isInternational?: boolean;
  isYouth?: boolean;
};

export type Match = {
  id: string;
  competitionId: string;
  seasonName?: string;
  date: string;
  kickoffTime?: string;
  homeTeam: Team;
  awayTeam: Team;
  score?: {
    home: number;
    away: number;
  };
  status?: MatchStatus;
  matchWeek?: number;
  stage?: string;
  venue?: string;
  referee?: string;
};

export type MatchEvent = {
  id: string;
  matchId: string;
  sequence: number;
  period: number;
  minute: number;
  second: number;
  type: string;
  teamId?: string;
  teamName?: string;
  playerId?: string;
  playerName?: string;
  possessionTeamId?: string;
  possessionTeamName?: string;
  location?: PitchLocation;
  endLocation?: PitchLocation;
  durationSeconds?: number;
  outcome?: string;
  bodyPart?: EventBodyPart;
  underPressure?: boolean;
  playPattern?: PlayPattern;
  isCross?: boolean;
  passType?: PassType;
  shotType?: ShotType;
  freezeFrame?: ShotFreezeFramePlayer[];
};

export interface StatsProvider {
  listCompetitions(): Promise<Competition[]>;
  listMatches(competitionId: string): Promise<Match[]>;
  getMatch(matchId: string): Promise<Match | null>;
  getMatchEvents(matchId: string): Promise<MatchEvent[]>;
  listTeams(): Promise<Team[]>;
  listPlayers(teamId: string): Promise<Player[]>;
}
