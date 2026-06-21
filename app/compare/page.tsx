import Link from "next/link";

import {
  availableMetrics,
  formatMetricValue,
  METRICS,
  type EntityType,
} from "@/lib/insights/metrics";
import {
  getCompetition,
  getEntityMetrics,
  listCompetitions,
  listEntities,
  type EntityMetrics,
} from "@/lib/insights/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <Link href="/ask" style={styles.navLink}>
          Ask
        </Link>
        <Link href="/scout" style={styles.navLink}>
          Scout
        </Link>
        <Link href="/replay" style={styles.navLink}>
          Replay
        </Link>
      </nav>

      <h1 style={styles.title}>Compare</h1>
      <p style={styles.subtitle}>
        Pick two players or two teams in a competition and see them side by side.
        Every number is read directly from the database. A metric that a feed does
        not provide is shown as not available, never as zero.
      </p>

      <form method="get" style={styles.form}>
        <div style={styles.row}>
          <label style={styles.label}>
            Competition
            <select name="competition" defaultValue={competitionId} style={styles.select}>
              <option value="">Choose a competition</option>
              {competitions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.seasonName ? ` ${option.seasonName}` : ""} ({option.source})
                </option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Compare
            <select name="type" defaultValue={entityType} style={styles.select}>
              <option value="players">Players</option>
              <option value="teams">Teams</option>
            </select>
          </label>
        </div>

        {competition ? (
          entities.length > 0 ? (
            <div style={styles.row}>
              <label style={styles.label}>
                First
                <select name="a" defaultValue={aId} style={styles.select}>
                  <option value="">Choose</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={styles.label}>
                Second
                <select name="b" defaultValue={bId} style={styles.select}>
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
            <p style={styles.note}>
              No {entityType} are available for this competition. This feed does not
              provide that data.
            </p>
          )
        ) : null}

        <button type="submit" style={styles.button}>
          Compare
        </button>
        {competition && entities.length > 0 && !pair ? (
          <span style={styles.hint}>
            Pick both, then compare. If you just changed the competition, the choices
            above are now loaded.
          </span>
        ) : null}
      </form>

      {pair && competition ? (
        <section style={styles.result}>
          <p style={styles.context}>
            {competition.name}
            {competition.seasonName ? ` ${competition.seasonName}` : ""}, source{" "}
            {competition.source}
          </p>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thMetric}>Metric</th>
                <th style={styles.th}>{pair.a.name}</th>
                <th style={styles.th}>{pair.b.name}</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric) => {
                const available = availableMetrics(
                  competition.source,
                  entityType,
                ).includes(metric.key);
                const aValue = available ? pair.a.values[metric.key] ?? null : null;
                const bValue = available ? pair.b.values[metric.key] ?? null : null;
                return (
                  <tr key={metric.key}>
                    <td style={styles.tdMetric}>{metric.label}</td>
                    <td style={cellStyle(aValue, bValue)}>
                      {formatMetricValue(aValue, metric.key)}
                    </td>
                    <td style={cellStyle(bValue, aValue)}>
                      {formatMetricValue(bValue, metric.key)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shareHref ? (
            <p style={styles.share}>
              <a href={shareHref} style={styles.link}>
                Open shareable card
              </a>
              , a downloadable image of these numbers.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function cellStyle(
  value: number | null,
  other: number | null,
): React.CSSProperties {
  const isHigher = value !== null && other !== null && value > other;
  return {
    ...styles.td,
    fontWeight: isHigher ? 700 : 400,
    color: value === null ? "#999" : "#111",
  };
}

function readParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "32px 24px 48px",
    fontFamily: "system-ui, sans-serif",
    color: "#111",
  },
  nav: { display: "flex", gap: "16px", marginBottom: "16px", fontSize: "14px" },
  navLink: { color: "#333" },
  title: { fontSize: "28px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { color: "#555", marginBottom: "20px", lineHeight: 1.5 },
  form: { display: "flex", flexDirection: "column", gap: "12px", marginBottom: "8px" },
  row: { display: "flex", gap: "12px", flexWrap: "wrap" },
  label: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "#555", flex: 1, minWidth: "200px" },
  select: {
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "#fff",
  },
  button: {
    alignSelf: "flex-start",
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#111",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  hint: { fontSize: "12px", color: "#888" },
  note: { fontSize: "14px", color: "#b00020" },
  result: { marginTop: "24px" },
  context: { fontSize: "13px", color: "#666", marginBottom: "12px" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: "15px" },
  thMetric: { textAlign: "left", borderBottom: "2px solid #ddd", padding: "10px 8px", width: "40%" },
  th: { textAlign: "right", borderBottom: "2px solid #ddd", padding: "10px 8px" },
  tdMetric: { textAlign: "left", borderBottom: "1px solid #eee", padding: "10px 8px", color: "#555" },
  td: { textAlign: "right", borderBottom: "1px solid #eee", padding: "10px 8px" },
  share: { marginTop: "16px", fontSize: "14px", color: "#555" },
  link: { color: "#333" },
};
