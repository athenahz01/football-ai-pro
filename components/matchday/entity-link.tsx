import Link from "next/link";

import { EntityIdentity } from "./entity-identity";

// A tappable entity reference. Every player and team name across the app routes to its
// profile through this, so the flow is continuous: a name is never a dead end. The
// chip variant pairs the name with its visual identity.

type EntityKind = "player" | "team";

export function entityHref(kind: EntityKind, id: string): string {
  return kind === "player"
    ? `/player/${encodeURIComponent(id)}`
    : `/team/${encodeURIComponent(id)}`;
}

export function EntityLink({
  kind,
  id,
  name,
  variant = "text",
}: {
  kind: EntityKind;
  id: string;
  name: string;
  variant?: "text" | "chip";
}) {
  if (variant === "chip") {
    return (
      <Link
        href={entityHref(kind, id)}
        className="md-chip"
        style={{ paddingLeft: "var(--space-1)" }}
      >
        <EntityIdentity name={name} kind={kind} size="sm" />
        <span style={{ color: "var(--md-text-hi)" }}>{name}</span>
      </Link>
    );
  }

  return (
    <Link
      href={entityHref(kind, id)}
      style={{ color: "var(--md-text-hi)", borderBottom: "1px solid var(--md-volt)" }}
    >
      {name}
    </Link>
  );
}
