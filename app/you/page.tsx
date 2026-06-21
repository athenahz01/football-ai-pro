import Link from "next/link";

import { listFollows } from "@/lib/follows/service";
import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";
import { PanelCard } from "@/components/matchday/cards";

import { FollowManager, type Entity } from "./follow-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The profile and following screen, restyled onto MATCHDAY. The data still comes from
// the existing read only query layer and the follows service; only the look changes.

export default async function YouPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return (
      <main className="md-screen">
        <div className="md-container" style={{ maxWidth: "560px" }}>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
            Your profile
          </span>
          <h1 className="md-display-3" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
            Following
          </h1>
          <PanelCard>
            <p className="md-body" style={{ color: "var(--md-text-mid)", marginTop: 0 }}>
              Sign in to follow teams and players and get a personalized starting
              point.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
              <Link href="/auth" className="md-btn md-btn--primary md-btn--md">
                Sign in
              </Link>
              <Link href="/ask" className="md-btn md-btn--ghost md-btn--md">
                Keep asking
              </Link>
            </div>
          </PanelCard>
        </div>
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
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "760px" }}>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          Your profile
        </span>
        <h1 className="md-display-3" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
          Following
        </h1>
        <p
          className="md-body"
          style={{ color: "var(--md-text-mid)", marginBottom: "var(--space-5)" }}
        >
          Follow the teams and players you care about. Each one gives you ready
          made questions that run through the same grounded pipeline as anything
          else you ask.
        </p>
        <FollowManager initialFollows={follows} teams={teams} players={players} />
      </div>
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
