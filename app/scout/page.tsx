import Link from "next/link";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULT_LIMIT = 20;

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
  const metric =
    metricOptions.includes(metricParam as MetricKey)
      ? (metricParam as MetricKey)
      : null;

  let rows: LeaderboardRow[] = [];
  if (competition && metric) {
    rows = await leaderboard(
      competition,
      entityType,
      metric,
      minShots,
      RESULT_LIMIT,
    );
  }

  const hasShots = rows.some((row) => row.shots !== null);
  const shareHref =
    competition && metric
      ? `/api/share/scout?competition=${encodeURIComponent(competition.id)}&type=${entityType}&metric=${metric}&min=${minShots}`
      : null;

  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <Link href="/ask" style={styles.navLink}>
          Ask
        </Link>
        <Link href="/compare" style={styles.navLink}>
          Compare
        </Link>
        <Link href="/replay" style={styles.navLink}>
          Replay
        </Link>
      </nav>

      <h1 style={styles.title}>Scout</h1>
      <p style={styles.subtitle}>
        Rank players or teams in a competition by a metric, with an optional minimum
        shots filter. This is a ranked view over real data, read straight from the
        database, not a recommendation. Only metrics that the feed for the
        competition provides are offered.
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
            Rank
            <select name="type" defaultValue={entityType} style={styles.select}>
              <option value="players">Players</option>
              <option value="teams">Teams</option>
            </select>
          </label>
        </div>

        {competition ? (
          metricOptions.length > 0 ? (
            <div style={styles.row}>
              <label style={styles.label}>
                Metric
                <select name="metric" defaultValue={metricParam} style={styles.select}>
                  <option value="">Choose a metric</option>
                  {metricOptions.map((key) => (
                    <option key={key} value={key}>
                      {metricDef(key)?.label ?? key}
                    </option>
                  ))}
                </select>
              </label>
              <label style={styles.label}>
                Minimum shots
                <input
                  name="min"
                  type="number"
                  min={0}
                  defaultValue={minShots}
                  style={styles.select}
                />
              </label>
            </div>
          ) : (
            <p style={styles.note}>
              This feed provides no rankable {entityType} metrics for this
              competition.
            </p>
          )
        ) : null}

        <button type="submit" style={styles.button}>
          Rank
        </button>
      </form>

      {competition && metric ? (
        <section style={styles.result}>
          <p style={styles.context}>
            {competition.name}
            {competition.seasonName ? ` ${competition.seasonName}` : ""}, ranked by{" "}
            {metricDef(metric)?.label}, source {competition.source}
          </p>
          {rows.length === 0 ? (
            <p style={styles.note}>No rows match this query.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thRank}>#</th>
                  <th style={styles.thName}>
                    {entityType === "players" ? "Player" : "Team"}
                  </th>
                  <th style={styles.th}>{metricDef(metric)?.label}</th>
                  {hasShots ? <th style={styles.th}>Shots</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.rank}-${row.name}`}>
                    <td style={styles.tdRank}>{row.rank}</td>
                    <td style={styles.tdName}>{row.name}</td>
                    <td style={styles.td}>{formatValue(row.value, metric)}</td>
                    {hasShots ? (
                      <td style={styles.td}>{row.shots ?? ""}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {shareHref && rows.length > 0 ? (
            <p style={styles.share}>
              <a href={shareHref} style={styles.link}>
                Open shareable card
              </a>
              , a downloadable image of this leaderboard.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function formatValue(value: number, metric: MetricKey): string {
  return value.toFixed(metricDef(metric)?.decimals ?? 0);
}

function clampMin(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
  note: { fontSize: "14px", color: "#b00020" },
  result: { marginTop: "24px" },
  context: { fontSize: "13px", color: "#666", marginBottom: "12px" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: "15px" },
  thRank: { textAlign: "left", borderBottom: "2px solid #ddd", padding: "10px 8px", width: "40px" },
  thName: { textAlign: "left", borderBottom: "2px solid #ddd", padding: "10px 8px" },
  th: { textAlign: "right", borderBottom: "2px solid #ddd", padding: "10px 8px" },
  tdRank: { textAlign: "left", borderBottom: "1px solid #eee", padding: "10px 8px", color: "#999" },
  tdName: { textAlign: "left", borderBottom: "1px solid #eee", padding: "10px 8px" },
  td: { textAlign: "right", borderBottom: "1px solid #eee", padding: "10px 8px" },
  share: { marginTop: "16px", fontSize: "14px", color: "#555" },
  link: { color: "#333" },
};
