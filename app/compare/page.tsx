import {
  availableMetrics,
  formatMetricValue,
  METRICS,
  type EntityType,
  type MetricKey,
} from "@/lib/insights/metrics";
import {
  getCompetition,
  getEntityMetrics,
  listCompetitions,
  listEntities,
  type EntityMetrics,
} from "@/lib/insights/queries";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";
import { ShareToCommunity } from "@/app/community/share-to-community";
import { EntityIdentity } from "@/components/matchday/entity-identity";
import { EntityLink } from "@/components/matchday/entity-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compare, restyled onto MATCHDAY. The data still comes from the existing fixed read
// only insights queries. Per source honesty is preserved: a metric a feed does not
// carry reads "not available", never zero.

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const competitionId = readParam(params.competition);
  const entityType: EntityType = params.type === "teams" ? "teams" : "players";
  const aId = readParam(params.a);
  const bId = readParam(params.b);

  const competitions = await listCompetitions();
  const competition = competitionId
    ? await getCompetition(competitionId)
    : null;
  const entities = competition
    ? await listEntities(competition.id, entityType)
    : [];

  let pair: { a: EntityMetrics; b: EntityMetrics } | null = null;
  if (competition && aId && bId && aId !== bId) {
    const [a, b] = await Promise.all([
      getEntityMetrics(competition, entityType, aId),
      getEntityMetrics(competition, entityType, bId),
    ]);
    if (a && b) {
      pair = { a, b };
    }
  }

  const shareHref =
    competition && aId && bId
      ? `/api/share/compare?competition=${encodeURIComponent(competition.id)}&type=${entityType}&a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`
      : null;

  const signedIn = (await getAuthenticatedUser()) !== null;
  const available = competition
    ? availableMetrics(competition.source, entityType)
    : [];
  const headlineMetric = available[0];
  const entityKind = entityType === "players" ? "player" : "team";

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "820px" }}>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          Head to head
        </span>
        <h1 className="md-display-3" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
          Compare
        </h1>
        <p
          className="md-body"
          style={{ color: "var(--md-text-mid)", marginBottom: "var(--space-5)" }}
        >
          Pick two players or two teams in a competition and see them side by side.
          Every number is read directly from the database. A metric that a feed does
          not provide is shown as not available, never as zero.
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
              Compare
              <TypeSegment value={entityType} />
            </div>
          </div>

          {competition ? (
            entities.length > 0 ? (
              <div className="md-form-row">
                <label className="md-field">
                  First
                  <select name="a" defaultValue={aId} className="md-select" style={{ height: "44px" }}>
                    <option value="">Choose</option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="md-field">
                  Second
                  <select name="b" defaultValue={bId} className="md-select" style={{ height: "44px" }}>
                    <option value="">Choose</option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <p className="md-small" style={{ color: "var(--md-amber)" }}>
                No {entityType} are available for this competition. This feed does not
                provide that data.
              </p>
            )
          ) : null}

          <button type="submit" className="md-btn md-btn--primary md-btn--md" style={{ alignSelf: "flex-start" }}>
            Compare
          </button>
        </form>

        {pair && competition ? (
          <section>
            <p className="md-small" style={{ color: "var(--md-text-lo)", marginBottom: "var(--space-4)" }}>
              {competition.name}
              {competition.seasonName ? ` ${competition.seasonName}` : ""}, source{" "}
              {competition.source}
            </p>

            {headlineMetric ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "var(--space-4)",
                  marginBottom: "var(--space-5)",
                }}
              >
                <HeadlineCard kind={entityKind} id={aId} name={pair.a.name} metric={headlineMetric} value={pair.a.values[headlineMetric] ?? null} />
                <HeadlineCard kind={entityKind} id={bId} name={pair.b.name} metric={headlineMetric} value={pair.b.values[headlineMetric] ?? null} />
              </div>
            ) : null}

            <div className="md-panel">
              <table className="md-data-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="num">
                      <EntityLink kind={entityKind} id={aId} name={pair.a.name} />
                    </th>
                    <th className="num">
                      <EntityLink kind={entityKind} id={bId} name={pair.b.name} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((metric) => {
                    const isAvailable = available.includes(metric.key);
                    const aValue = isAvailable ? pair.a.values[metric.key] ?? null : null;
                    const bValue = isAvailable ? pair.b.values[metric.key] ?? null : null;
                    return (
                      <tr key={metric.key}>
                        <td style={{ color: "var(--md-text-mid)" }}>{metric.label}</td>
                        <td className="num" style={cellColor(aValue, bValue)}>
                          {cell(aValue, metric.key)}
                        </td>
                        <td className="num" style={cellColor(bValue, aValue)}>
                          {cell(bValue, metric.key)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {shareHref ? (
              <p className="md-small" style={{ color: "var(--md-text-mid)", marginTop: "var(--space-4)" }}>
                <a href={shareHref} style={{ color: "var(--md-volt)" }}>
                  Open shareable card
                </a>
                , a downloadable image of these numbers.
              </p>
            ) : null}

            <ShareToCommunity
              kind="comparison"
              params={{ competition: competition.id, type: entityType, a: aId, b: bId }}
              signedIn={signedIn}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}

function TypeSegment({ value }: { value: EntityType }) {
  return (
    <div className="md-seg" role="group" aria-label="Compare players or teams">
      <label className="md-seg-radio">
        <input type="radio" name="type" value="players" defaultChecked={value === "players"} />
        <span>Players</span>
      </label>
      <label className="md-seg-radio">
        <input type="radio" name="type" value="teams" defaultChecked={value === "teams"} />
        <span>Teams</span>
      </label>
    </div>
  );
}

function HeadlineCard({
  kind,
  id,
  name,
  metric,
  value,
}: {
  kind: "player" | "team";
  id: string;
  name: string;
  metric: MetricKey;
  value: number | null;
}) {
  return (
    <div className="md-statcard">
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
        <EntityIdentity name={name} kind={kind} size="sm" />
        <EntityLink kind={kind} id={id} name={name} />
      </span>
      <span className="md-stat-xl" style={{ color: "var(--md-volt)" }}>
        <span className="md-ltr">
          {value === null ? "n/a" : formatMetricValue(value, metric)}
        </span>
      </span>
      <span className="md-small" style={{ color: "var(--md-text-mid)" }}>
        {METRICS.find((m) => m.key === metric)?.label}
      </span>
    </div>
  );
}

function cell(value: number | null, key: MetricKey) {
  if (value === null) {
    return <span className="md-na">not available</span>;
  }
  return <span className="md-ltr">{formatMetricValue(value, key)}</span>;
}

function cellColor(value: number | null, other: number | null): React.CSSProperties {
  const isHigher = value !== null && other !== null && value > other;
  return {
    color: value === null ? "var(--md-text-lo)" : "var(--md-text-hi)",
    fontWeight: isHigher ? 700 : 400,
  };
}

function readParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
