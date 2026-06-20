import { NextRequest } from "next/server";

import {
  availableMetrics,
  metricDef,
  type EntityType,
  type MetricKey,
} from "@/lib/insights/metrics";
import {
  getCompetition,
  leaderboard,
  type LeaderboardRow,
} from "@/lib/insights/queries";
import {
  creditLines,
  escapeXml,
  messageCard,
  svgResponse,
} from "@/lib/insights/share-svg";

export const runtime = "nodejs";

const CARD_LIMIT = 8;

// Shareable leaderboard card. It re-runs the same fixed read only leaderboard
// query and renders the top rows as a lightweight SVG image at a stable URL,
// showing only real queried numbers and crediting the data source.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const competitionId = params.get("competition") ?? "";
  const entityType: EntityType = params.get("type") === "teams" ? "teams" : "players";
  const metricParam = params.get("metric") ?? "";
  const minShots = clampMin(params.get("min"));

  const competition = competitionId ? await getCompetition(competitionId) : null;
  if (!competition) {
    return svgResponse(messageCard("Pick a competition and a metric to rank."));
  }

  const metric = availableMetrics(competition.source, entityType).includes(
    metricParam as MetricKey,
  )
    ? (metricParam as MetricKey)
    : null;

  if (!metric) {
    return svgResponse(messageCard("That metric is not available for this feed."));
  }

  const rows = await leaderboard(
    competition,
    entityType,
    metric,
    minShots,
    CARD_LIMIT,
  );

  if (rows.length === 0) {
    return svgResponse(messageCard("That leaderboard has no rows."));
  }

  return svgResponse(
    leaderboardCard(
      `${competition.name}${competition.seasonName ? ` ${competition.seasonName}` : ""}`,
      competition.source,
      metric,
      rows,
    ),
  );
}

function leaderboardCard(
  competitionLabel: string,
  source: string,
  metric: MetricKey,
  rows: LeaderboardRow[],
): string {
  const top = 110;
  const lineHeight = 32;
  const decimals = metricDef(metric)?.decimals ?? 0;

  const body = rows
    .map((row, index) => {
      const y = top + index * lineHeight;
      return `
        <text x="40" y="${y}" font-size="15" fill="#999">${row.rank}</text>
        <text x="80" y="${y}" font-size="15" fill="#111">${esc(row.name)}</text>
        <text x="660" y="${y}" font-size="15" fill="#111" text-anchor="end">${row.value.toFixed(decimals)}</text>
        <line x1="40" y1="${y + 9}" x2="660" y2="${y + 9}" stroke="#eee" />`;
    })
    .join("");

  const height = top + rows.length * lineHeight + 70;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="${height}" viewBox="0 0 700 ${height}" font-family="system-ui, sans-serif">
    <rect x="0" y="0" width="700" height="${height}" fill="#ffffff" stroke="#e2e2e2" />
    <text x="40" y="44" font-size="22" font-weight="700" fill="#111">Football AI Pro leaderboard</text>
    <text x="40" y="68" font-size="13" fill="#666">${esc(competitionLabel)}, ranked by ${esc(metricDef(metric)?.label ?? metric)}, source ${esc(source)}</text>
    ${body}
    ${creditLines(source, height)}
  </svg>`;
}

function esc(value: string): string {
  return escapeXml(value);
}

function clampMin(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
