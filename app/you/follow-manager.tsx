"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
    <div>
      <section style={styles.section}>
        <h2 style={styles.heading}>Your follows</h2>
        {follows.length === 0 ? (
          <p style={styles.empty}>
            You are not following anyone yet. Add a team or a player below.
          </p>
        ) : (
          <ul style={styles.list}>
            {follows.map((item) => (
              <li key={`${item.type}-${item.id}`} style={styles.item}>
                <div style={styles.itemHeader}>
                  <span>
                    <strong>{item.name}</strong>
                    <span style={styles.kind}>{item.type}</span>
                  </span>
                  <button
                    type="button"
                    style={styles.unfollow}
                    disabled={busy}
                    onClick={() => mutate("DELETE", item.type, item.id)}
                  >
                    Unfollow
                  </button>
                </div>
                <div style={styles.suggestions}>
                  {suggestionsFor(item.name).map((question) => (
                    <Link
                      key={question}
                      href={`/ask?q=${encodeURIComponent(question)}`}
                      style={styles.suggestion}
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

      {error !== null ? <p style={styles.error}>{error}</p> : null}

      <section style={styles.section}>
        <h2 style={styles.heading}>Follow a team</h2>
        <div style={styles.row}>
          <select
            style={styles.select}
            value={teamChoice}
            onChange={(event) => setTeamChoice(event.target.value)}
          >
            <option value="">Choose a team</option>
            {teams.map((team) => (
              <option
                key={team.id}
                value={team.id}
                disabled={followedTeamIds.has(team.id)}
              >
                {team.name}
                {followedTeamIds.has(team.id) ? " (following)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={styles.followButton}
            disabled={busy || teamChoice.length === 0}
            onClick={() => mutate("POST", "team", teamChoice).then(() => setTeamChoice(""))}
          >
            Follow
          </button>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>Follow a player</h2>
        <div style={styles.row}>
          <select
            style={styles.select}
            value={playerChoice}
            onChange={(event) => setPlayerChoice(event.target.value)}
          >
            <option value="">Choose a player</option>
            {players.map((player) => (
              <option
                key={player.id}
                value={player.id}
                disabled={followedPlayerIds.has(player.id)}
              >
                {player.name}
                {followedPlayerIds.has(player.id) ? " (following)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={styles.followButton}
            disabled={busy || playerChoice.length === 0}
            onClick={() =>
              mutate("POST", "player", playerChoice).then(() =>
                setPlayerChoice(""),
              )
            }
          >
            Follow
          </button>
        </div>
      </section>
    </div>
  );
}

function suggestionsFor(name: string): string[] {
  return [
    `How many goals did ${name} score in the 2022 World Cup?`,
    `How many shots did ${name} attempt in the 2022 World Cup?`,
  ];
}

const styles: Record<string, React.CSSProperties> = {
  section: { marginBottom: "28px" },
  heading: { fontSize: "16px", fontWeight: 600, marginBottom: "10px" },
  empty: { color: "#555" },
  list: { listStyle: "none", padding: 0, margin: 0 },
  item: {
    border: "1px solid #eee",
    borderRadius: "8px",
    padding: "12px 14px",
    marginBottom: "10px",
  },
  itemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kind: {
    marginLeft: "8px",
    fontSize: "12px",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px",
  },
  suggestion: {
    fontSize: "13px",
    color: "#333",
    background: "#f3f3f3",
    border: "1px solid #e2e2e2",
    borderRadius: "999px",
    padding: "6px 12px",
    textDecoration: "none",
  },
  unfollow: {
    padding: "6px 12px",
    fontSize: "13px",
    color: "#333",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "8px",
    cursor: "pointer",
  },
  row: { display: "flex", gap: "8px" },
  select: {
    flex: 1,
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "#fff",
  },
  followButton: {
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#111",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  error: { color: "#b00020", marginBottom: "16px" },
};
