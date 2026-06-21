import {
  availableMetrics,
  metricDef,
  type EntityType,
  type MetricKey,
} from "@/lib/insights/metrics";
import {
  getCompetition,
  leaderboard,
  listCompetitions,
  type LeaderboardRow,
} from "@/lib/insights/queries";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";
import { ShareToCommunity } from "@/app/community/share-to-community";
import { Leaderboard } from "@/components/matchday/dataviz/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULT_LIMIT = 20;

// Scout, restyled onto MATCHDAY. The ranked view still reads straight from the fixed
// read only insights queries. Leaders get the Volt bar; only metrics a feed provides
// are offered, so the screen never invents a rankable metric.

export default async function ScoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const competitionId = readParam(params.competition);
  const entityType: EntityType = params.type === "teams" ? "teams" : "players";
  const metricParam = readParam(params.metric);
  const minShots = clampMin(readParam(params.min));

  const competitions = await listCompetitions();
  const competition = competitionId
    ? await getCompetition(competitionId)
    : null;
  const metricOptions = competition
    ? availableMetrics(competition.source, entityType)
    : [];
  const metric = metricOptions.includes(metricParam as MetricKey)
    ? (metricParam as MetricKey)
    : null;

  let rows: LeaderboardRow[] = [];
  if (competition && metric) {
    rows = await leaderboard(competition, entityType, metric, minShots, RESULT_LIMIT);
  }

  const hasShots = rows.some((row) => row.shots !== null);
  const signedIn = (await getAuthenticatedUser()) !== null;
  const shareHref =
    competition && metric
      ? `/api/share/scout?competition=${encodeURIComponent(competition.id)}&type=${entityType}&metric=${metric}&min=${minShots}`
      : null;
  const decimals = metric ? metricDef(metric)?.decimals ?? 0 : 0;

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "760px" }}>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          Rankings
        </span>
        <h1 className="md-display-3" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
          Scout
        </h1>
        <p
          className="md-body"
          style={{ color: "var(--md-text-mid)", marginBottom: "var(--space-5)" }}
        >
          Rank players or teams in a competition by a metric, with an optional minimum
          shots filter. This is a ranked view over real data, read straight from the
          database, not a recommendation. Only metrics the feed provides are offered.
        </p>

        <form
          method="get"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
            marginBottom: "var(--space-6)",
          }}
        >
          <div className="md-form-row">
            <label className="md-field">
              Competition
              <select name="competition" defaultValue={competitionId} className="md-select" style={{ height: "44px" }}>
                <option value="">Choose a competition</option>
                {competitions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                    {option.seasonName ? ` ${option.seasonName}` : ""} ({option.source})
                  </option>
                ))}
              </select>
            </label>
            <div className="md-field" style={{ flex: "0 0 auto" }}>
              Rank
              <div className="md-seg" role="group" aria-label="Rank players or teams">
                <label className="md-seg-radio">
                  <input type="radio" name="type" value="players" defaultChecked={entityType === "players"} />
                  <span>Players</span>
                </label>
                <label className="md-seg-radio">
                  <input type="radio" name="type" value="teams" defaultChecked={entityType === "teams"} />
                  <span>Teams</span>
                </label>
              </div>
            </div>
          </div>

          {competition ? (
            metricOptions.length > 0 ? (
              <div className="md-form-row">
                <label className="md-field">
                  Metric
                  <select name="metric" defaultValue={metricParam} className="md-select" style={{ height: "44px" }}>
                    <option value="">Choose a metric</option>
                    {metricOptions.map((key) => (
                      <option key={key} value={key}>
                        {metricDef(key)?.label ?? key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="md-field">
                  Minimum shots
                  <input name="min" type="number" min={0} defaultValue={minShots} className="md-input" />
                </label>
              </div>
            ) : (
              <p className="md-small" style={{ color: "var(--md-amber)" }}>
                This feed provides no rankable {entityType} metrics for this
                competition.
              </p>
            )
          ) : null}

          <button type="submit" className="md-btn md-btn--primary md-btn--md" style={{ alignSelf: "flex-start" }}>
            Rank
          </button>
        </form>

        {competition && metric ? (
          <section>
            <p className="md-small" style={{ color: "var(--md-text-lo)", marginBottom: "var(--space-4)" }}>
              {competition.name}
              {competition.seasonName ? ` ${competition.seasonName}` : ""}, ranked by{" "}
              {metricDef(metric)?.label}, source {competition.source}
            </p>
            {rows.length === 0 ? (
              <p className="md-small" style={{ color: "var(--md-text-mid)" }}>
                No rows match this query.
              </p>
            ) : (
              <div className="md-panel">
                <Leaderboard
                  items={rows.map((row) => ({
                    label: hasShots && row.shots !== null
                      ? `${row.name}  (${row.shots} shots)`
                      : row.name,
                    value: row.value,
                    display: row.value.toFixed(decimals),
                  }))}
                />
              </div>
            )}

            {shareHref && rows.length > 0 ? (
              <p className="md-small" style={{ color: "var(--md-text-mid)", marginTop: "var(--space-4)" }}>
                <a href={shareHref} style={{ color: "var(--md-volt)" }}>
                  Open shareable card
                </a>
                , a downloadable image of this leaderboard.
              </p>
            ) : null}

            {rows.length > 0 ? (
              <ShareToCommunity
                kind="leaderboard"
                params={{ competition: competition.id, type: entityType, metric, min: minShots }}
                signedIn={signedIn}
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function clampMin(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
