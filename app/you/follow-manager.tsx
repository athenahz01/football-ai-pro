"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/matchday/button";

export type Entity = {
  id: string;
  name: string;
};

type FollowedItem = {
  type: "team" | "player";
  id: string;
  name: string;
  createdAt: string;
};

// Following manager, restyled onto MATCHDAY. The follow and unfollow calls and the
// personalized suggestions are unchanged; they still go through the existing follows
// API, where the author comes from the session.

export function FollowManager({
  initialFollows,
  teams,
  players,
}: {
  initialFollows: FollowedItem[];
  teams: Entity[];
  players: Entity[];
}) {
  const [follows, setFollows] = useState<FollowedItem[]>(initialFollows);
  const [teamChoice, setTeamChoice] = useState("");
  const [playerChoice, setPlayerChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const followedTeamIds = useMemo(
    () => new Set(follows.filter((f) => f.type === "team").map((f) => f.id)),
    [follows],
  );
  const followedPlayerIds = useMemo(
    () => new Set(follows.filter((f) => f.type === "player").map((f) => f.id)),
    [follows],
  );

  async function refresh() {
    const response = await fetch("/api/follows");
    if (response.ok) {
      setFollows((await response.json()) as FollowedItem[]);
    }
  }

  async function mutate(
    method: "POST" | "DELETE",
    type: "team" | "player",
    id: string,
  ) {
    if (busy || id.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/follows", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "That did not work. Please try again.");
        return;
      }
      await refresh();
    } catch {
      setError("The request failed. Check that the dev server is running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <section>
        <h2 className="md-title" style={{ marginBottom: "var(--space-3)" }}>
          Your follows
        </h2>
        {follows.length === 0 ? (
          <p className="md-body" style={{ color: "var(--md-text-mid)" }}>
            You are not following anyone yet. Add a team or a player below.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {follows.map((item) => (
              <li key={`${item.type}-${item.id}`} className="md-panel">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--space-3)",
                  }}
                >
                  <span>
                    <strong style={{ color: "var(--md-text-hi)" }}>
                      {item.name}
                    </strong>
                    <span
                      className="md-overline"
                      style={{ color: "var(--md-text-lo)", marginLeft: "var(--space-2)" }}
                    >
                      {item.type}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => mutate("DELETE", item.type, item.id)}
                  >
                    Unfollow
                  </Button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-3)",
                  }}
                >
                  {suggestionsFor(item.name).map((question) => (
                    <Link
                      key={question}
                      href={`/ask?q=${encodeURIComponent(question)}`}
                      className="md-chip"
                    >
                      {question}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error !== null ? (
        <p className="md-small" style={{ color: "var(--md-down)" }}>
          {error}
        </p>
      ) : null}

      <FollowPicker
        heading="Follow a team"
        choices={teams}
        followed={followedTeamIds}
        value={teamChoice}
        onValue={setTeamChoice}
        busy={busy}
        onFollow={() => mutate("POST", "team", teamChoice).then(() => setTeamChoice(""))}
      />
      <FollowPicker
        heading="Follow a player"
        choices={players}
        followed={followedPlayerIds}
        value={playerChoice}
        onValue={setPlayerChoice}
        busy={busy}
        onFollow={() =>
          mutate("POST", "player", playerChoice).then(() => setPlayerChoice(""))
        }
      />
    </div>
  );
}

function FollowPicker({
  heading,
  choices,
  followed,
  value,
  onValue,
  busy,
  onFollow,
}: {
  heading: string;
  choices: Entity[];
  followed: Set<string>;
  value: string;
  onValue: (value: string) => void;
  busy: boolean;
  onFollow: () => void;
}) {
  return (
    <section>
      <h2 className="md-title" style={{ marginBottom: "var(--space-3)" }}>
        {heading}
      </h2>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <select
          className="md-select"
          style={{ flex: 1, minWidth: "200px", height: "44px" }}
          value={value}
          onChange={(event) => onValue(event.target.value)}
        >
          <option value="">{heading.replace("Follow", "Choose")}</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id} disabled={followed.has(choice.id)}>
              {choice.name}
              {followed.has(choice.id) ? " (following)" : ""}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          size="lg"
          disabled={busy || value.length === 0}
          onClick={onFollow}
        >
          Follow
        </Button>
      </div>
    </section>
  );
}

function suggestionsFor(name: string): string[] {
  return [
    `How many goals did ${name} score in the 2022 World Cup?`,
    `How many shots did ${name} attempt in the 2022 World Cup?`,
  ];
}
