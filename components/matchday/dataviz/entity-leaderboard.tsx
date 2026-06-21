import Link from "next/link";

import { EntityIdentity } from "../entity-identity";
import { entityHref } from "../entity-link";

// A leaderboard of bars where each row carries the entity's visual identity and links
// to its profile when resolved. The leader bar is Volt, the rest neutral. The numbers
// are shown as text, so the rows are their own accessible alternative.

export type EntityBar = {
  name: string;
  value: number;
  display: string;
  kind?: "player" | "team";
  id?: string;
  note?: string;
};

export function EntityLeaderboard({ items }: { items: EntityBar[] }) {
  const max = items.reduce((peak, item) => Math.max(peak, item.value), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {items.map((item, index) => {
        const pct = max > 0 ? Math.max(2, (item.value / max) * 100) : 0;
        const isLeader = index === 0;
        const name =
          item.id && item.kind ? (
            <Link href={entityHref(item.kind, item.id)} style={{ color: "var(--md-text-hi)" }}>
              {item.name}
            </Link>
          ) : (
            <span style={{ color: "var(--md-text-hi)" }}>{item.name}</span>
          );

        return (
          <div key={`${item.name}-${index}`} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            {item.kind ? <EntityIdentity name={item.name} kind={item.kind} size="sm" /> : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "6px" }}>
                <span className="md-title" style={{ fontSize: "14px" }}>
                  {name}
                  {item.note ? (
                    <span className="md-small" style={{ color: "var(--md-text-lo)", marginLeft: "var(--space-2)" }}>
                      {item.note}
                    </span>
                  ) : null}
                </span>
                <span className="md-lb-value md-ltr">{item.display}</span>
              </div>
              <div className="md-lb-track" aria-hidden>
                <div
                  className="md-lb-fill"
                  style={{ width: `${pct}%`, background: isLeader ? "var(--md-volt)" : "var(--md-text-lo)" }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
