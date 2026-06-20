import Link from "next/link";

import { listFollows } from "@/lib/follows/service";
import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";

import { FollowManager, type Entity } from "./follow-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function YouPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return (
      <main style={styles.main}>
        <h1 style={styles.title}>Following</h1>
        <p style={styles.subtitle}>
          Sign in to follow teams and players and get a personalized starting
          point.
        </p>
        <p>
          <Link href="/auth" style={styles.link}>
            Sign in
          </Link>
          {" or "}
          <Link href="/ask" style={styles.link}>
            keep asking questions
          </Link>
          .
        </p>
      </main>
    );
  }

  const followsResult = await listFollows();
  const follows = followsResult.ok ? followsResult.data : [];
  const [teams, players] = await Promise.all([
    readEntities("teams", "team_id"),
    readEntities("players", "player_id"),
  ]);

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Following</h1>
      <p style={styles.subtitle}>
        Follow the teams and players you care about. Each one gives you ready
        made questions that run through the same grounded pipeline as anything
        else you ask.
      </p>
      <p style={styles.back}>
        <Link href="/ask" style={styles.link}>
          Back to asking questions
        </Link>
      </p>
      <FollowManager initialFollows={follows} teams={teams} players={players} />
    </main>
  );
}

async function readEntities(
  table: "teams" | "players",
  idColumn: "team_id" | "player_id",
): Promise<Entity[]> {
  const result = await executeSqlInReadOnlyTransaction(
    `select ${idColumn} as id, name from ${table} where name is not null order by name`,
    1_000,
    5_000,
  );

  if (!result.ok) {
    return [];
  }

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
  }));
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily: "system-ui, sans-serif",
    color: "#111",
  },
  title: { fontSize: "28px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { color: "#555", marginBottom: "16px", lineHeight: 1.5 },
  back: { fontSize: "14px", marginBottom: "24px" },
  link: { color: "#333" },
};
