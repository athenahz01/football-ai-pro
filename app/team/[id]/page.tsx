import Link from "next/link";
import { notFound } from "next/navigation";

import { getTeamProfile, type MatchResult } from "@/lib/insights/entities";
import { EntityIdentity } from "@/components/matchday/entity-identity";
import { StatGrid } from "@/components/matchday/profile/stat-grid";
import { ProfileActions } from "@/components/matchday/profile/profile-actions";
import { PitchMap } from "@/components/matchday/dataviz/pitch-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Team profile hub. Identity, key stats as visuals, recent form where the data allows,
// a shot map from real StatsBomb coordinates, inline actions, and grounded question
// cards. All data comes from fixed read only queries; a metric a feed lacks shows as
// not available.

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getTeamProfile(id);

  if (profile === null) {
    notFound();
  }

  const meta = [profile.country, profile.competitionName ?? profile.competitionId]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "860px" }}>
        <header style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", marginBottom: "var(--space-5)" }}>
          <EntityIdentity name={profile.name} kind="team" size="lg" />
          <div>
            <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
              Team, source {profile.source}
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
            kind="team"
            id={profile.id}
            name={profile.name}
            competitionId={profile.competitionId}
          />
        </div>

        <Section title="Key numbers">
          <StatGrid stats={profile.stats} />
        </Section>

        {profile.recentMatches.length > 0 ? (
          <Section title="Recent form">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {profile.recentMatches.map((match) => (
                <FormRow key={match.matchId} match={match} />
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Shot map">
          {profile.shots.length > 0 ? (
            <>
              <PitchMap
                title={`${profile.name} shots`}
                events={profile.shots.map((shot) => ({
                  x: shot.x,
                  y: shot.y,
                  kind: shot.goal ? "goal" : "event",
                }))}
              />
              <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: "var(--space-3)" }}>
                {profile.shots.length} shots from real StatsBomb event coordinates.
                Magenta marks a goal. Attacking left to right.
              </p>
            </>
          ) : (
            <p className="md-small" style={{ color: "var(--md-text-lo)" }}>
              No shot coordinates are available for this team in the current data.
            </p>
          )}
        </Section>

        <Section title="Ask about this team">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {[
              `How many goals did ${profile.name} score in the 2022 World Cup?`,
              `What was ${profile.name} total expected goals in the 2022 World Cup?`,
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

function FormRow({ match }: { match: MatchResult }) {
  const color =
    match.result === "W"
      ? "var(--md-up)"
      : match.result === "L"
        ? "var(--md-down)"
        : "var(--md-text-mid)";
  return (
    <div
      className="md-panel"
      style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)" }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          flex: "none",
          borderRadius: "var(--r-sm)",
          background: "var(--md-raised)",
          color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--md-font-display)",
          fontSize: 14,
        }}
      >
        {match.result ?? "?"}
      </span>
      <span className="md-body" style={{ color: "var(--md-text-hi)", flex: 1 }}>
        {match.home ? "vs" : "at"} {match.opponent}
      </span>
      <span className="md-tnum md-ltr" style={{ color: "var(--md-text-mid)" }}>
        {match.scoreFor ?? "-"} : {match.scoreAgainst ?? "-"}
      </span>
    </div>
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
