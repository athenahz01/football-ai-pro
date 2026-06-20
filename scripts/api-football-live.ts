import { config } from "@/lib/config/env";
import { ApiFootballProvider } from "@/lib/providers/api-football";

// Bounded live check for the API-Football provider. It uses the real key to fetch
// one league, a few fixtures, and one fixture's events, then prints the mapped
// neutral output. It makes about three requests, well under the free tier limit of
// 100 per day, and writes nothing to the database. This proves the provider works
// against the real API without loading any commercial data into our schema.
//
// Run it with the key in .env.local:
//   npm run verify:api-football
// Optionally point it at a different league and season:
//   npm run verify:api-football -- 39 2023

const DEFAULT_LEAGUE_ID = 39; // Premier League
const DEFAULT_SEASON = 2023;

async function main() {
  if (!config.apiFootballKey) {
    console.log(
      "API_FOOTBALL_KEY is not set in .env.local. Skipping the live check.",
    );
    return;
  }

  const leagueId = Number(process.argv[2] ?? DEFAULT_LEAGUE_ID);
  const season = Number(process.argv[3] ?? DEFAULT_SEASON);
  const competitionId = `${leagueId}:${season}`;
  const provider = new ApiFootballProvider({ apiKey: config.apiFootballKey });

  console.log(`Live check against league ${leagueId}, season ${season}.\n`);

  // Request 1: competitions.
  const competitions = await provider.listCompetitions();
  const competition = competitions.find((entry) => entry.id === competitionId);
  console.log(`Mapped ${competitions.length} competitions from the leagues endpoint.`);
  console.log("Target competition:", competition ?? "not found", "\n");

  // Request 2: fixtures for the competition.
  const matches = await provider.listMatches(competitionId);
  console.log(`Mapped ${matches.length} matches. First three:`);
  for (const match of matches.slice(0, 3)) {
    console.log({
      id: match.id,
      competitionId: match.competitionId,
      date: match.date,
      home: match.homeTeam.name,
      away: match.awayTeam.name,
      score: match.score,
      status: match.status,
      venue: match.venue,
    });
  }
  console.log();

  // Request 3: events for the first finished match.
  const finished = matches.find((match) => match.status === "complete") ?? matches[0];
  if (finished) {
    const events = await provider.getMatchEvents(finished.id);
    console.log(`Mapped ${events.length} events for match ${finished.id}. First three:`);
    for (const event of events.slice(0, 3)) {
      console.log({
        minute: event.minute,
        type: event.type,
        team: event.teamName,
        player: event.playerName,
        outcome: event.outcome,
        location: event.location,
        bodyPart: event.bodyPart,
      });
    }
    console.log(
      "\nNote: location and bodyPart are undefined by design. API-Football provides no pitch coordinates, so xT, VAEP, and xG cannot be computed from it.",
    );
  }

  console.log("\nNothing was written to the database.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
