import "server-only";

import { executeReadOnlySql } from "@/lib/sql/executor";

type CompetitionReference = {
  name: string;
  seasonName: string | null;
  source: string;
};

type TeamReference = {
  name: string;
};

const MAX_REFERENCE_ROWS = 500;

let datasetReferencePromise: Promise<string> | undefined;

export function getDatasetReference(): Promise<string> {
  datasetReferencePromise ??= loadDatasetReference();
  return datasetReferencePromise;
}

async function loadDatasetReference(): Promise<string> {
  const [competitionsResult, teamsResult] = await Promise.all([
    executeReadOnlySql(
      `
        select distinct
          name,
          season_name,
          source
        from competitions
        where name is not null
        order by name, season_name
      `,
      { maxRows: MAX_REFERENCE_ROWS },
    ),
    executeReadOnlySql(
      `
        select distinct
          name
        from teams
        where name is not null
        order by name
      `,
      { maxRows: MAX_REFERENCE_ROWS },
    ),
  ]);

  if (!competitionsResult.ok) {
    throw new Error(competitionsResult.message);
  }

  if (!teamsResult.ok) {
    throw new Error(teamsResult.message);
  }

  return formatDatasetReference(
    competitionsResult.rows
      .map((row) => ({
        name: String(row.name ?? "").trim(),
        seasonName:
          row.season_name === null || row.season_name === undefined
            ? null
            : String(row.season_name).trim(),
        source: String(row.source ?? "statsbomb").trim(),
      }))
      .filter((competition) => competition.name.length > 0),
    teamsResult.rows
      .map((row) => ({
        name: String(row.name ?? "").trim(),
      }))
      .filter((team) => team.name.length > 0),
  );
}

function formatDatasetReference(
  competitions: CompetitionReference[],
  teams: TeamReference[],
): string {
  return [
    buildInstructionLine(competitions),
    CAPABILITY_INSTRUCTION,
    "Available competitions and seasons:",
    formatCompetitions(competitions),
    "Available teams:",
    formatTeams(teams),
  ].join("\n");
}

const CAPABILITY_INSTRUCTION = [
  "Each row belongs to a data feed shown by the source column, present on competitions, teams, players, matches, and match_events.",
  "StatsBomb competitions, source 'statsbomb', carry shot level event detail and the derived metrics expected threat (action_values.xt_value), VAEP (action_values.vaep_value and its components), and expected goals (shot_xg.xg).",
  "API-Football competitions, source 'api_football', carry results, goals, cards, and squads, but no shot level detail and none of those derived metrics.",
  "To restrict a query to one feed, filter on the source column.",
  "If the user asks for a metric or detail that does not exist for the requested competition's feed, write SQL that returns no rows instead of inventing a number or borrowing from the other feed. For example, expected threat, VAEP, and expected goals do not exist for api_football competitions.",
  "For a player or team total or leaderboard of expected threat, VAEP, or expected goals, prefer the small precomputed tables player_metric_totals and team_metric_totals, ordering by total_xt, total_vaep, or total_xg, rather than summing the full action set, which is slow.",
].join(" ");

function buildInstructionLine(competitions: CompetitionReference[]): string {
  const hasWorldCup2022 = competitions.some(
    (competition) =>
      competition.name === "FIFA World Cup" &&
      competition.seasonName === "2022",
  );
  const mappingInstruction = hasWorldCup2022
    ? "When the user names a tournament such as \"2022 World Cup\", map it to competitions.name = 'FIFA World Cup' and competitions.season_name = '2022'."
    : "When the user names a tournament, map it to the exact competition name and season_name listed below.";

  return [
    "Use only exact dimension labels from this reference.",
    "The database holds more than one competition and more than one data feed, so scope a query to the competition or feed the question is about.",
    mappingInstruction,
  ].join(" ");
}

function formatCompetitions(competitions: CompetitionReference[]): string {
  if (competitions.length === 0) {
    return "- No competitions are currently listed.";
  }

  return competitions
    .map((competition) => {
      const seasonFilter =
        competition.seasonName === null || competition.seasonName.length === 0
          ? "competitions.season_name is null"
          : `competitions.season_name = ${formatSqlLiteral(
              competition.seasonName,
            )}`;

      return `- competitions.name = ${formatSqlLiteral(
        competition.name,
      )}, ${seasonFilter}, source ${formatSqlLiteral(competition.source)}`;
    })
    .join("\n");
}

function formatTeams(teams: TeamReference[]): string {
  if (teams.length === 0) {
    return "- No teams are currently listed.";
  }

  return teams.map((team) => `- ${team.name}`).join("\n");
}

function formatSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
