import type { ReactNode } from "react";

// The headline stat callout. The answer is led by the entity, then the big Anton
// number, then the context label. The number is the figure from the query rows, never
// model authored, and stays LTR.

export function HeadlineStat({
  kicker = "The answer",
  entity,
  value,
  context,
}: {
  kicker?: string;
  entity: string;
  value: ReactNode;
  context?: string;
}) {
  return (
    <div>
      <span className="md-overline" style={{ color: "var(--md-volt)" }}>
        {kicker}
      </span>
      {entity ? (
        <div
          className="md-display-1"
          style={{ color: "var(--md-text-hi)", marginTop: "var(--space-2)" }}
        >
          {entity}
        </div>
      ) : null}
      <div
        className="md-stat-xl"
        style={{
          color: "var(--md-volt)",
          fontSize: "clamp(48px, 14vw, 96px)",
          marginTop: "var(--space-2)",
        }}
      >
        <span className="md-ltr">{value}</span>
      </div>
      {context ? (
        <p
          className="md-body"
          style={{ color: "var(--md-text-mid)", marginTop: "var(--space-2)" }}
        >
          {context}
        </p>
      ) : null}
    </div>
  );
}
