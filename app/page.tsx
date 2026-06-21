import Link from "next/link";

import { getAuthenticatedUser } from "@/lib/supabase/server-client";
import { listFollows } from "@/lib/follows/service";
import {
  cardsForFollows,
  featuredPlayers,
  featuredTeams,
  type EntityCardData,
} from "@/lib/insights/entities";
import { HeroAsk } from "@/components/matchday/hero-ask";
import { EntityCard } from "@/components/matchday/entity-card";
import { Badge } from "@/components/matchday/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The home screen, the new front door. It is your personalized football world, not a
// search box. Asking is front and centre. A signed in follower sees their teams and
// players as cards; everyone sees featured entities drawn from real top expected goals.
// The data is thin today, so the empty and limited states are designed to look
// intentional and honest, never padded with invented content.

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  const [topPlayers, topTeams] = await Promise.all([
    featuredPlayers(4),
    featuredTeams(4),
  ]);

  let followed: EntityCardData[] = [];
  if (user) {
    const result = await listFollows();
    if (result.ok) {
      const players = result.data
        .filter((item) => item.type === "player")
        .map((item) => ({ id: item.id, name: item.name }));
      const teams = result.data
        .filter((item) => item.type === "team")
        .map((item) => ({ id: item.id, name: item.name }));
      followed = await cardsForFollows(players, teams);
    }
  }

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "960px" }}>
        <section style={{ padding: "var(--space-6) 0 var(--space-8)" }}>
          <span
            className="md-overline"
            style={{ color: "var(--md-text-lo)", display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}
          >
            <Badge kind="grounded" /> Real numbers and verifiable answers
          </span>
          <h1 className="md-display-1" style={{ marginTop: "var(--space-4)" }}>
            {user ? "Your football world." : "Ask football anything."}
          </h1>
          <p
            className="md-body"
            style={{ color: "var(--md-text-mid)", marginTop: "var(--space-4)", maxWidth: "52ch" }}
          >
            One football intelligence you talk to. Ask in plain language and get an
            answer that leads with the number and shows its work. No made up stats,
            ever.
          </p>
          <div style={{ marginTop: "var(--space-6)", maxWidth: "640px" }}>
            <HeroAsk />
          </div>
        </section>

        {user ? (
          <Section title="Your teams and players">
            {followed.length > 0 ? (
              <CardGrid cards={followed} />
            ) : (
              <div className="md-panel">
                <p className="md-body" style={{ color: "var(--md-text-mid)", marginTop: 0 }}>
                  You are not following anyone yet. Open a player or team below, or
                  manage your follows, and your world will fill in here.
                </p>
                <Link href="/you" className="md-btn md-btn--secondary md-btn--md" style={{ marginTop: "var(--space-2)" }}>
                  Manage follows
                </Link>
              </div>
            )}
          </Section>
        ) : null}

        <Section title="Featured players">
          {topPlayers.length > 0 ? (
            <CardGrid
              cards={topPlayers.map((player) => ({
                kind: player.kind,
                id: player.id,
                name: player.name,
                metricLabel: player.metricLabel,
                display: player.display,
              }))}
            />
          ) : (
            <EmptyNote />
          )}
        </Section>

        <Section title="Featured teams">
          {topTeams.length > 0 ? (
            <CardGrid
              cards={topTeams.map((team) => ({
                kind: team.kind,
                id: team.id,
                name: team.name,
                metricLabel: team.metricLabel,
                display: team.display,
              }))}
            />
          ) : (
            <EmptyNote />
          )}
        </Section>

        <Section title="Quick explorations">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {[
              "Which player scored the most goals in the 2022 World Cup?",
              "Which team had the highest total expected goals?",
              "Who attempted the most shots, and how many?",
            ].map((question) => (
              <Link key={question} href={`/ask?q=${encodeURIComponent(question)}`} className="md-chip">
                {question}
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </main>
  );
}

function CardGrid({ cards }: { cards: EntityCardData[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "var(--space-3)",
      }}
    >
      {cards.map((card) => (
        <EntityCard key={`${card.kind}-${card.id}`} {...card} />
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "var(--space-8)" }}>
      <h2 className="md-display-3" style={{ fontSize: "20px", marginBottom: "var(--space-4)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyNote() {
  return (
    <p className="md-small" style={{ color: "var(--md-text-lo)" }}>
      No entities are available yet. As data grows, they appear here.
    </p>
  );
}
