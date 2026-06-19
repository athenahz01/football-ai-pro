import "server-only";

import { executeReadOnlySql } from "@/lib/sql/executor";

type CompetitionReference = {
  name: string;
  seasonName: string | null;
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
          season_name
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
    "Available competitions and seasons:",
    formatCompetitions(competitions),
    "Available teams:",
    formatTeams(teams),
  ].join("\n");
}

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
    "The current database contains only the competitions listed here, so a competition filter is often unnecessary.",
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
      )}, ${seasonFilter}`;
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
