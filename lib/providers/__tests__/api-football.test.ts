import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ApiFootballProvider,
  type ApiFootballEnvelope,
  type ApiFootballTransport,
} from "@/lib/providers/api-football";

function load(name: string): ApiFootballEnvelope<unknown> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as ApiFootballEnvelope<unknown>;
}

const SAMPLES = {
  leagues: load("leagues.json"),
  fixtures: load("fixtures.json"),
  events: load("fixture-events.json"),
  squad: load("squad.json"),
};

// A stub transport that serves the saved JSON, so the full fetch to map path is
// exercised without ever calling the live API or spending the daily quota.
function stubTransport(): ApiFootballTransport {
  return async (endpoint, params) => {
    if (endpoint === "leagues") {
      return SAMPLES.leagues;
    }
    if (endpoint === "fixtures" && params.id !== undefined) {
      const response = (
        SAMPLES.fixtures.response as Array<{ fixture: { id: number } }>
      ).filter((fixture) => String(fixture.fixture.id) === params.id);
      return { errors: [], response };
    }
    if (endpoint === "fixtures") {
      return SAMPLES.fixtures;
    }
    if (endpoint === "fixtures/events") {
      return SAMPLES.events;
    }
    if (endpoint === "players/squads") {
      return SAMPLES.squad;
    }
    throw new Error(`Unexpected endpoint ${endpoint}`);
  };
}

function makeProvider(): ApiFootballProvider {
  return new ApiFootballProvider({ transport: stubTransport() });
}

test("maps leagues into one neutral competition per season", async () => {
  const competitions = await makeProvider().listCompetitions();

  assert.equal(competitions.length, 2);
  assert.deepEqual(
    competitions.map((competition) => competition.id),
    ["39:2022", "39:2023"],
  );
  const latest = competitions[1];
  assert.equal(latest.name, "Premier League");
  assert.equal(latest.country, "England");
  assert.equal(latest.seasonName, "2023");
  assert.equal(latest.gender, "unknown");
});

test("maps fixtures into neutral matches with a leagueId:season competition id", async () => {
  const matches = await makeProvider().listMatches("39:2023");

  assert.equal(matches.length, 2);

  const finished = matches[0];
  assert.equal(finished.id, "1035037");
  assert.equal(finished.competitionId, "39:2023");
  assert.equal(finished.date, "2023-08-11");
  assert.equal(finished.kickoffTime, "19:00:00");
  assert.equal(finished.homeTeam.id, "44");
  assert.equal(finished.homeTeam.name, "Burnley");
  assert.equal(finished.awayTeam.id, "50");
  assert.deepEqual(finished.score, { home: 0, away: 3 });
  assert.equal(finished.status, "complete");
  assert.equal(finished.venue, "Turf Moor");
  assert.equal(finished.referee, "Robert Jones");
  assert.equal(finished.stage, "Regular Season - 1");

  const upcoming = matches[1];
  assert.equal(upcoming.score, undefined);
  assert.equal(upcoming.status, "scheduled");
  assert.equal(upcoming.referee, undefined);
});

test("getMatch fetches a single fixture by id", async () => {
  const match = await makeProvider().getMatch("1035037");

  assert.notEqual(match, null);
  assert.equal(match?.id, "1035037");
  assert.equal(match?.awayTeam.name, "Manchester City");
});

test("maps events and leaves every coordinate dependent field undefined", async () => {
  const events = await makeProvider().getMatchEvents("1035037");

  assert.equal(events.length, 3);

  const goal = events[0];
  assert.equal(goal.id, "1035037:0");
  assert.equal(goal.sequence, 0);
  assert.equal(goal.period, 1);
  assert.equal(goal.minute, 5);
  assert.equal(goal.second, 0);
  assert.equal(goal.type, "Goal");
  assert.equal(goal.teamId, "50");
  assert.equal(goal.playerId, "1100");
  assert.equal(goal.playerName, "Erling Haaland");
  assert.equal(goal.outcome, "Normal Goal");

  // The non negotiable limitation: API-Football gives no coordinates or rich
  // event detail, so these stay undefined and are never fabricated.
  assert.equal(goal.location, undefined);
  assert.equal(goal.endLocation, undefined);
  assert.equal(goal.bodyPart, undefined);
  assert.equal(goal.passType, undefined);
  assert.equal(goal.shotType, undefined);
  assert.equal(goal.playPattern, undefined);
  assert.equal(goal.isCross, undefined);
  assert.equal(goal.possessionTeamId, undefined);

  assert.equal(events[1].type, "Yellow Card");
  assert.equal(events[1].period, 2);
  assert.equal(events[2].type, "Substitution");
});

test("maps a squad into neutral players", async () => {
  const players = await makeProvider().listPlayers("50");

  assert.deepEqual(
    players.map((player) => player.name),
    ["Ederson", "Erling Haaland"],
  );
  const haaland = players[1];
  assert.equal(haaland.id, "1100");
  assert.equal(haaland.teamId, "50");
  assert.equal(haaland.jerseyNumber, 9);
  assert.deepEqual(haaland.positions, ["Attacker"]);
});

test("listTeams surfaces unique teams from the fixtures already retrieved", async () => {
  const provider = makeProvider();
  await provider.listMatches("39:2023");
  const teams = await provider.listTeams();

  assert.deepEqual(
    teams.map((team) => team.name),
    ["Arsenal", "Burnley", "Manchester City", "Nottingham Forest"],
  );
});

test("a non empty errors body is surfaced as a thrown error", async () => {
  const failing = new ApiFootballProvider({
    transport: async () => ({
      errors: { token: "Invalid API key." },
      response: [],
    }),
  });

  await assert.rejects(
    () => failing.listCompetitions(),
    /API-Football returned errors/,
  );
});
