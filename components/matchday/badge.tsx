import type { ReactNode } from "react";

// MATCHDAY badges. GROUNDED and 3D TRACKING are brand positive in Volt. ENTERTAINMENT
// is the mandatory predictions notice in amber. LIVE is neutral with a dot. Deltas
// use a label and an arrow glyph, never colour alone, so up and down read without
// relying on hue.

type BadgeKind = "grounded" | "tracking" | "entertainment" | "live";

const LABEL: Record<BadgeKind, string> = {
  grounded: "Grounded",
  tracking: "3D Tracking",
  entertainment: "Entertainment",
  live: "Live",
};

export function Badge({
  kind,
  children,
}: {
  kind: BadgeKind;
  children?: ReactNode;
}) {
  return (
    <span className={`md-badge md-badge--${kind}`}>
      {kind === "grounded" ? <span aria-hidden>{"✓"}</span> : null}
      {kind === "live" ? <span className="md-badge-dot" aria-hidden /> : null}
      {children ?? LABEL[kind]}
    </span>
  );
}

export function Delta({
  direction,
  children,
}: {
  direction: "up" | "down";
  children: ReactNode;
}) {
  const glyph = direction === "up" ? "▲" : "▼";
  const word = direction === "up" ? "up" : "down";
  return (
    <span className={`md-delta md-delta--${direction}`}>
      <span aria-hidden>{glyph}</span>
      <span className="md-visually-hidden">{word}</span>
      <span className="md-tnum md-ltr">{children}</span>
    </span>
  );
}
