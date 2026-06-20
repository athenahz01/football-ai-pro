import { NextRequest } from "next/server";

import {
  availableMetrics,
  formatMetricValue,
  METRICS,
  type EntityType,
} from "@/lib/insights/metrics";
import {
  getCompetition,
  getEntityMetrics,
  type EntityMetrics,
} from "@/lib/insights/queries";
import {
  creditLines,
  escapeXml as esc,
  messageCard,
  svgResponse,
} from "@/lib/insights/share-svg";

export const runtime = "nodejs";

// Shareable comparison card. It re-runs the same fixed read only queries and
// renders the real values as a lightweight SVG image at a stable URL. It shows
// only queried numbers, never anything invented, and credits the data source.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const competitionId = params.get("competition") ?? "";
  const entityType: EntityType = params.get("type") === "teams" ? "teams" : "players";
  const aId = params.get("a") ?? "";
  const bId = params.get("b") ?? "";

  const competition = competitionId ? await getCompetition(competitionId) : null;
  if (!competition || !aId || !bId) {
    return svgResponse(messageCard("Pick a competition and two entities to compare."));
  }

  const [a, b] = await Promise.all([
    getEntityMetrics(competition, entityType, aId),
    getEntityMetrics(competition, entityType, bId),
  ]);

  if (!a || !b) {
    return svgResponse(messageCard("That comparison has no data."));
  }

  return svgResponse(
    comparisonCard(
      `${competition.name}${competition.seasonName ? ` ${competition.seasonName}` : ""}`,
      competition.source,
      entityType,
      a,
      b,
    ),
  );
}

function comparisonCard(
  competitionLabel: string,
  source: string,
  entityType: EntityType,
  a: EntityMetrics,
  b: EntityMetrics,
): string {
  const available = availableMetrics(source, entityType);
  const top = 110;
  const lineHeight = 34;
  const rows = METRICS.map((metric, index) => {
    const y = top + index * lineHeight;
    const has = available.includes(metric.key);
    const aValue = formatMetricValue(has ? a.values[metric.key] ?? null : null, metric.key);
    const bValue = formatMetricValue(has ? b.values[metric.key] ?? null : null, metric.key);
    return `
      <text x="40" y="${y}" font-size="16" fill="#555">${esc(metric.label)}</text>
      <text x="400" y="${y}" font-size="16" fill="#111" text-anchor="end">${esc(aValue)}</text>
      <text x="660" y="${y}" font-size="16" fill="#111" text-anchor="end">${esc(bValue)}</text>
      <line x1="40" y1="${y + 10}" x2="660" y2="${y + 10}" stroke="#eee" />`;
  }).join("");

  const height = top + METRICS.length * lineHeight + 70;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="${height}" viewBox="0 0 700 ${height}" font-family="system-ui, sans-serif">
    <rect x="0" y="0" width="700" height="${height}" fill="#ffffff" stroke="#e2e2e2" />
    <text x="40" y="44" font-size="22" font-weight="700" fill="#111">Football AI Pro comparison</text>
    <text x="40" y="68" font-size="13" fill="#666">${esc(competitionLabel)}, source ${esc(source)}</text>
    <text x="400" y="96" font-size="15" font-weight="700" fill="#111" text-anchor="end">${esc(a.name)}</text>
    <text x="660" y="96" font-size="15" font-weight="700" fill="#111" text-anchor="end">${esc(b.name)}</text>
    ${rows}
    ${creditLines(source, height)}
  </svg>`;
}

