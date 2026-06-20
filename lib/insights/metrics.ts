// Shared metric definitions for the comparison and scouting features. Pure data,
// no server imports, so both the server query layer and the pages can use it.
//
// Per source honesty lives here. Expected threat, VAEP, expected goals, and the
// event detail counts come only from StatsBomb, the only feed with event level
// detail and the precomputed totals. API-Football carries team goals from match
// scores only, and no player level data. A metric that is not available for a
// source is shown as not available, never as zero.

export type EntityType = "players" | "teams";

export type MetricKey = "goals" | "shots" | "passes" | "xt" | "vaep" | "xg";

export type MetricDef = {
  key: MetricKey;
  label: string;
  decimals: number;
};

export const METRICS: MetricDef[] = [
  { key: "goals", label: "Goals", decimals: 0 },
  { key: "shots", label: "Shots", decimals: 0 },
  { key: "passes", label: "Passes", decimals: 0 },
  { key: "xt", label: "Expected threat", decimals: 2 },
  { key: "vaep", label: "VAEP", decimals: 2 },
  { key: "xg", label: "Expected goals", decimals: 2 },
];

const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));

export function metricDef(key: string): MetricDef | undefined {
  return METRIC_BY_KEY.get(key as MetricKey);
}

export function availableMetrics(
  source: string,
  entityType: EntityType,
): MetricKey[] {
  if (source === "statsbomb") {
    return ["goals", "shots", "passes", "xt", "vaep", "xg"];
  }

  if (source === "api_football" && entityType === "teams") {
    return ["goals"];
  }

  return [];
}

export function isMetricAvailable(
  source: string,
  entityType: EntityType,
  key: string,
): boolean {
  return availableMetrics(source, entityType).includes(key as MetricKey);
}

export function formatMetricValue(
  value: number | null,
  key: MetricKey,
): string {
  if (value === null) {
    return "not available";
  }

  const def = METRIC_BY_KEY.get(key);
  return value.toFixed(def?.decimals ?? 0);
}
