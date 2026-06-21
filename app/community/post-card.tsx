import Link from "next/link";

import {
  availableMetrics,
  formatMetricValue,
  METRICS,
  metricDef,
} from "@/lib/insights/metrics";
import type { CommunityPost, RenderedPost } from "@/lib/community/service";
import { Badge } from "@/components/matchday/badge";
import { Leaderboard } from "@/components/matchday/dataviz/leaderboard";

// Renders one community post from its live data, restyled onto MATCHDAY. The post
// stored only parameters, and the feed re ran the fixed read only queries to produce
// this rendered data, so the numbers here are always real and current. Per source
// honesty is preserved: an unavailable metric reads "not available", and a replay
// keeps its image space and license labels and the 3D TRACKING badge.

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
    <article className="md-panel" style={{ marginBottom: "var(--space-4)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
        }}
      >
        <span className="md-overline" style={{ color: "var(--md-text-mid)" }}>
          {kindLabel(post.kind)}
        </span>
        <span className="md-small" style={{ color: "var(--md-text-lo)" }}>
          {post.authorLabel}, {post.viewCount}{" "}
          {post.viewCount === 1 ? "view" : "views"}
        </span>
      </div>

      {post.caption ? (
        <p
          className="md-body"
          style={{ color: "var(--md-text-hi)", margin: "0 0 var(--space-3)" }}
        >
          {post.caption}
        </p>
      ) : null}

      {rendered.ok ? (
        <RenderedBody rendered={rendered} />
      ) : (
        <p className="md-small" style={{ color: "var(--md-text-lo)" }}>
          {rendered.reason}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: "var(--space-5)",
          marginTop: "var(--space-4)",
        }}
      >
        {linkToDetail ? (
          <Link href={`/community/${post.id}`} className="md-small" style={{ color: "var(--md-volt)" }}>
            Open post {"→"}
          </Link>
        ) : null}
        {rendered.ok ? (
          <Link
            href={sourceHref(post.kind, post.params)}
            className="md-small"
            style={{ color: "var(--md-text-mid)" }}
          >
            {openLabel(post.kind)} {"→"}
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
        <p className="md-small" style={{ color: "var(--md-text-lo)", margin: "0 0 var(--space-3)" }}>
          {render.competitionName}
          {render.seasonName ? ` ${render.seasonName}` : ""}, source {render.source}
        </p>
        <table className="md-data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">{render.a.name}</th>
              <th className="num">{render.b.name}</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => {
              const isAvailable = available.includes(metric.key);
              const aValue = isAvailable ? render.a.values[metric.key] ?? null : null;
              const bValue = isAvailable ? render.b.values[metric.key] ?? null : null;
              return (
                <tr key={metric.key}>
                  <td style={{ color: "var(--md-text-mid)" }}>{metric.label}</td>
                  <td className="num">{metricCell(aValue, metric.key)}</td>
                  <td className="num">{metricCell(bValue, metric.key)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  }

  if (render.kind === "leaderboard") {
    return (
      <>
        <p className="md-small" style={{ color: "var(--md-text-lo)", margin: "0 0 var(--space-3)" }}>
          {render.competitionName}
          {render.seasonName ? ` ${render.seasonName}` : ""}, ranked by{" "}
          {metricDef(render.metric)?.label ?? render.metric}, source {render.source}
        </p>
        {render.rows.length === 0 ? (
          <p className="md-small" style={{ color: "var(--md-text-lo)" }}>
            This leaderboard has no rows right now.
          </p>
        ) : (
          <Leaderboard
            items={render.rows.map((row) => ({
              label: row.name,
              value: row.value,
              display: row.value.toFixed(metricDef(render.metric)?.decimals ?? 0),
            }))}
          />
        )}
      </>
    );
  }

  // Replay. The card shows a live summary read from the stored positions and links to
  // the full viewer. The image space and license labels and the 3D TRACKING badge are
  // kept, since the proprietary tracking is the differentiator.
  const clip = render.clip;
  const dims =
    clip.width && clip.height ? `${clip.width} by ${clip.height}` : "the video";
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-3)",
        }}
      >
        <Badge kind="tracking" />
        <span className="md-small" style={{ color: "var(--md-text-mid)" }}>
          {clip.clipName}
        </span>
      </div>
      <p className="md-body" style={{ color: "var(--md-text-mid)", margin: 0 }}>
        {render.playerCount}{" "}
        {render.playerCount === 1 ? "tracked player" : "tracked players"} and{" "}
        {render.ballCount} ball over {render.frameCount} frames.
      </p>
      <p className="md-small" style={{ color: "var(--md-text-lo)", margin: "var(--space-2) 0 0" }}>
        Positions are image space, normalized to {dims} frame, not a real pitch in
        meters. This clip is {clip.calibrated ? "calibrated" : "not calibrated"}.
      </p>
      <p className="md-small" style={{ color: "var(--md-text-lo)", margin: "var(--space-2) 0 0" }}>
        Source clip: {clip.clipName}
        {clip.author ? `, ${clip.author}` : ""}
        {clip.license ? `, ${clip.license}` : ""}
        {clip.licenseUrl ? (
          <>
            {" "}
            (
            <a href={clip.licenseUrl} style={{ color: "var(--md-text-mid)" }}>
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

function metricCell(value: number | null, key: (typeof METRICS)[number]["key"]) {
  if (value === null) {
    return <span className="md-na">not available</span>;
  }
  return <span className="md-ltr">{formatMetricValue(value, key)}</span>;
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
