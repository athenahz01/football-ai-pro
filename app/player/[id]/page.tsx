import Link from "next/link";
import { notFound } from "next/navigation";

import { getPlayerProfile } from "@/lib/insights/entities";
import { getPlayerEvents } from "@/lib/insights/pitch";
import { EntityIdentity } from "@/components/matchday/entity-identity";
import { StatGrid } from "@/components/matchday/profile/stat-grid";
import { ProfileActions } from "@/components/matchday/profile/profile-actions";
import { PitchViz } from "@/components/matchday/dataviz/pitch-viz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Player profile hub. A visual identity, key stats as visuals, a shot map from the
// real StatsBomb coordinates where they exist, inline actions, and grounded question
// cards. All data comes from fixed read only queries; a metric a feed lacks shows as
// not available.

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPlayerProfile(id);

  if (profile === null) {
    notFound();
  }

  const events = await getPlayerEvents(profile.id);
  const hasEvents = events.shots.length > 0 || events.passes.length > 0;

  const meta = [profile.teamName, profile.country, profile.competitionName ?? profile.competitionId]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "860px" }}>
        <header style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", marginBottom: "var(--space-5)" }}>
          <EntityIdentity name={profile.name} kind="player" size="lg" />
          <div>
            <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
              Player, source {profile.source}
            </span>
            <h1 className="md-display-3" style={{ margin: "2px 0 4px" }}>
              {profile.name}
            </h1>
            <p className="md-small" style={{ color: "var(--md-text-mid)", margin: 0 }}>
              {meta}
            </p>
          </div>
        </header>

        <div style={{ marginBottom: "var(--space-6)" }}>
          <ProfileActions
            kind="player"
            id={profile.id}
            name={profile.name}
            competitionId={profile.competitionId}
          />
        </div>

        <Section title="Key numbers">
          <StatGrid stats={profile.stats} />
        </Section>

        <Section title="Shots and passes">
          {hasEvents ? (
            <PitchViz
              title={`${profile.name} events`}
              shots={events.shots}
              passes={events.passes}
            />
          ) : (
            <p className="md-small" style={{ color: "var(--md-text-lo)" }}>
              No event coordinates are available for this player in the current data.
              This richness depends on the competition carrying event data.
            </p>
          )}
        </Section>

        <Section title="Ask about this player">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {[
              `How many shots did ${profile.name} attempt in the 2022 World Cup?`,
              `What was ${profile.name} expected goals in the 2022 World Cup?`,
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "var(--space-8)" }}>
      <h2 className="md-overline" style={{ color: "var(--md-text-lo)", marginBottom: "var(--space-3)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
