import type { ProfileStats } from "@/lib/insights/entities";

// Key stats as a grid of stat cards, not a table. A metric a feed does not carry is
// shown as not available, never zero, so the honesty signal survives the visual
// treatment.

const FIELDS: { key: keyof ProfileStats; label: string; decimals: number }[] = [
  { key: "goals", label: "Goals", decimals: 0 },
  { key: "xg", label: "Expected goals", decimals: 2 },
  { key: "shots", label: "Shots", decimals: 0 },
  { key: "xt", label: "Expected threat", decimals: 2 },
  { key: "vaep", label: "VAEP", decimals: 2 },
  { key: "passes", label: "Passes", decimals: 0 },
];

export function StatGrid({ stats }: { stats: ProfileStats }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: "var(--space-3)",
      }}
    >
      {FIELDS.map((field) => {
        const value = stats[field.key];
        return (
          <div className="md-statcard" key={field.key}>
            <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
              {field.label}
            </span>
            <span
              className="md-stat-xl"
              style={{
                color: value === null ? "var(--md-text-lo)" : "var(--md-volt)",
                fontSize: "34px",
              }}
            >
              {value === null ? (
                <span className="md-na" style={{ fontSize: "15px" }}>
                  not available
                </span>
              ) : (
                <span className="md-ltr">{value.toFixed(field.decimals)}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
