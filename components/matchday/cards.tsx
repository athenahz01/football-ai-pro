import type { HTMLAttributes, ReactNode } from "react";

// Panel card, the default container. Stat card carries an Anton numeral with an
// overline label, for example XT / 90 over a big number.

export function PanelCard({
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`md-panel ${className}`.trim()} {...rest} />;
}

export function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
}) {
  return (
    <div className="md-statcard">
      <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
        {label}
      </span>
      <span className="md-stat-xl" style={{ color: "var(--md-text-hi)" }}>
        <span className="md-ltr">{value}</span>
      </span>
      {unit ? (
        <span className="md-small" style={{ color: "var(--md-text-mid)" }}>
          {unit}
        </span>
      ) : null}
    </div>
  );
}
