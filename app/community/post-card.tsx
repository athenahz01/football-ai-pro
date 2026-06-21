import Link from "next/link";

import {
  availableMetrics,
  formatMetricValue,
  METRICS,
  metricDef,
} from "@/lib/insights/metrics";
import type { CommunityPost, RenderedPost } from "@/lib/community/service";

// Renders one community post from its live data. The post stored only parameters,
// and the feed re ran the fixed read only queries to produce this rendered data, so
// the numbers here are always real and current. Per source honesty is preserved: an
// unavailable metric reads "not available", and a replay keeps its image space and
// license labels.

export function PostCard({
  post,
  rendered,
  linkToDetail,
}: {
  post: CommunityPost;
  rendered: RenderedPost;
  linkToDetail: boolean;
}) {
  return (
    <article style={styles.card}>
      <div style={styles.metaRow}>
        <span style={styles.kind}>{kindLabel(post.kind)}</span>
        <span style={styles.meta}>
          {post.authorLabel}, {post.viewCount}{" "}
          {post.viewCount === 1 ? "view" : "views"}
        </span>
      </div>

      {post.caption ? <p style={styles.caption}>{post.caption}</p> : null}

      {rendered.ok ? (
        <RenderedBody rendered={rendered} />
      ) : (
        <p style={styles.note}>{rendered.reason}</p>
      )}

      <div style={styles.links}>
        {linkToDetail ? (
          <Link href={`/community/${post.id}`} style={styles.link}>
            Open post
          </Link>
        ) : null}
        {rendered.ok ? (
          <Link href={sourceHref(post.kind, post.params)} style={styles.link}>
            {openLabel(post.kind)}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function RenderedBody({
  rendered,
}: {
  rendered: Extract<RenderedPost, { ok: true }>;
}) {
  const render = rendered.render;

  if (render.kind === "comparison") {
    const available = availableMetrics(render.source, render.entityType);
    return (
      <>
        <p style={styles.context}>
          {render.competitionName}
          {render.seasonName ? ` ${render.seasonName}` : ""}, source {render.source}
        </p>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.thMetric}>Metric</th>
              <th style={styles.th}>{render.a.name}</th>
              <th style={styles.th}>{render.b.name}</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => {
              const isAvailable = available.includes(metric.key);
              const aValue = isAvailable ? render.a.values[metric.key] ?? null : null;
              const bValue = isAvailable ? render.b.values[metric.key] ?? null : null;
              return (
                <tr key={metric.key}>
                  <td style={styles.tdMetric}>{metric.label}</td>
                  <td style={valueStyle(aValue)}>
                    {formatMetricValue(aValue, metric.key)}
                  </td>
                  <td style={valueStyle(bValue)}>
                    {formatMetricValue(bValue, metric.key)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  }

  if (render.kind === "leaderboard") {
    const hasShots = render.rows.some((row) => row.shots !== null);
    return (
      <>
        <p style={styles.context}>
          {render.competitionName}
          {render.seasonName ? ` ${render.seasonName}` : ""}, ranked by{" "}
          {metricDef(render.metric)?.label ?? render.metric}, source {render.source}
        </p>
        {render.rows.length === 0 ? (
          <p style={styles.note}>This leaderboard has no rows right now.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thRank}>#</th>
                <th style={styles.thMetric}>
                  {render.entityType === "players" ? "Player" : "Team"}
                </th>
                <th style={styles.th}>{metricDef(render.metric)?.label}</th>
                {hasShots ? <th style={styles.th}>Shots</th> : null}
              </tr>
            </thead>
            <tbody>
              {render.rows.map((row) => (
                <tr key={`${row.rank}-${row.name}`}>
                  <td style={styles.tdRank}>{row.rank}</td>
                  <td style={styles.tdMetric}>{row.name}</td>
                  <td style={styles.td}>
                    {row.value.toFixed(metricDef(render.metric)?.decimals ?? 0)}
                  </td>
                  {hasShots ? <td style={styles.td}>{row.shots ?? ""}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  }

  // Replay. A full Three.js canvas per feed card would be heavy, so the card shows a
  // live summary read from the stored positions and links to the full viewer. The
  // image space and license labels are kept honest here too.
  const clip = render.clip;
  const dims =
    clip.width && clip.height ? `${clip.width} by ${clip.height}` : "the video";
  return (
    <>
      <p style={styles.context}>
        {clip.clipName}, {render.playerCount}{" "}
        {render.playerCount === 1 ? "tracked player" : "tracked players"} and{" "}
        {render.ballCount} ball over {render.frameCount} frames
      </p>
      <p style={styles.units}>
        Positions are image space, normalized to {dims} frame, not a real pitch in
        meters. This clip is {clip.calibrated ? "calibrated" : "not calibrated"}.
      </p>
      <p style={styles.credit}>
        Source clip: {clip.clipName}
        {clip.author ? `, ${clip.author}` : ""}
        {clip.license ? `, ${clip.license}` : ""}
        {clip.licenseUrl ? (
          <>
            {" "}
            (
            <a href={clip.licenseUrl} style={styles.link}>
              license
            </a>
            )
          </>
        ) : null}
        . Tracking is our own, source {clip.source}.
      </p>
    </>
  );
}

function valueStyle(value: number | null): React.CSSProperties {
  return { ...styles.td, color: value === null ? "#999" : "#111" };
}

function kindLabel(kind: CommunityPost["kind"]): string {
  if (kind === "comparison") return "Comparison";
  if (kind === "leaderboard") return "Leaderboard";
  return "Replay";
}

function openLabel(kind: CommunityPost["kind"]): string {
  if (kind === "comparison") return "Open in Compare";
  if (kind === "leaderboard") return "Open in Scout";
  return "Open in Replay";
}

function sourceHref(kind: CommunityPost["kind"], params: unknown): string {
  const p = (params ?? {}) as Record<string, unknown>;
  const get = (key: string) => encodeURIComponent(String(p[key] ?? ""));

  if (kind === "comparison") {
    return `/compare?competition=${get("competition")}&type=${get("type")}&a=${get("a")}&b=${get("b")}`;
  }
  if (kind === "leaderboard") {
    return `/scout?competition=${get("competition")}&type=${get("type")}&metric=${get("metric")}&min=${get("min")}`;
  }
  return `/replay?clip=${get("clip")}`;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: "1px solid #e6e6e6",
    borderRadius: "10px",
    padding: "16px 18px",
    marginBottom: "16px",
  },
  metaRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  kind: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  meta: { fontSize: "12px", color: "#888" },
  caption: { fontSize: "15px", color: "#111", margin: "4px 0 12px" },
  context: { fontSize: "13px", color: "#666", marginBottom: "10px" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: "14px" },
  thRank: { textAlign: "left", borderBottom: "2px solid #ddd", padding: "8px", width: "36px" },
  thMetric: { textAlign: "left", borderBottom: "2px solid #ddd", padding: "8px" },
  th: { textAlign: "right", borderBottom: "2px solid #ddd", padding: "8px" },
  tdRank: { textAlign: "left", borderBottom: "1px solid #eee", padding: "8px", color: "#999" },
  tdMetric: { textAlign: "left", borderBottom: "1px solid #eee", padding: "8px", color: "#555" },
  td: { textAlign: "right", borderBottom: "1px solid #eee", padding: "8px" },
  units: { fontSize: "13px", color: "#555", marginTop: "10px", lineHeight: 1.5 },
  credit: { fontSize: "12px", color: "#888", marginTop: "8px", lineHeight: 1.5 },
  note: { fontSize: "14px", color: "#777", marginTop: "8px" },
  links: { display: "flex", gap: "16px", marginTop: "12px", fontSize: "14px" },
  link: { color: "#333" },
};
