import Link from "next/link";

import { EntityIdentity } from "./entity-identity";
import { entityHref } from "./entity-link";

// A visual entity card for the home screen and other hubs: the generated identity, the
// name, and a key number, linking to the full profile. A card with no number for its
// metric shows the metric as not available rather than a fabricated zero.

export function EntityCard({
  kind,
  id,
  name,
  metricLabel,
  display,
}: {
  kind: "player" | "team";
  id: string;
  name: string;
  metricLabel: string;
  display: string | null;
}) {
  return (
    <Link
      href={entityHref(kind, id)}
      className="md-panel"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        textDecoration: "none",
      }}
    >
      <EntityIdentity name={name} kind={kind} size="md" />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          className="md-title"
          style={{ color: "var(--md-text-hi)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {name}
        </span>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          {kind}
        </span>
      </span>
      <span style={{ textAlign: "right" }}>
        <span className="md-stat-xl" style={{ color: "var(--md-volt)", fontSize: "24px", display: "block" }}>
          {display === null ? <span className="md-na" style={{ fontSize: "13px" }}>n/a</span> : <span className="md-ltr">{display}</span>}
        </span>
        <span className="md-small" style={{ color: "var(--md-text-lo)" }}>{metricLabel}</span>
      </span>
    </Link>
  );
}
