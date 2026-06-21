import { Badge } from "../badge";

// Win probability bar. Home is Volt, draw neutral, away magenta. Always paired with
// the ENTERTAINMENT badge, because a probability is a model estimate, not a tracked
// fact. Each share is labelled in text, so the split reads without colour alone.

export function WinProbabilityBar({
  home,
  draw,
  away,
  homeLabel = "Home",
  awayLabel = "Away",
}: {
  home: number;
  draw: number;
  away: number;
  homeLabel?: string;
  awayLabel?: string;
}) {
  const total = home + draw + away || 1;
  const pct = (value: number) => `${(value / total) * 100}%`;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-2)",
        }}
      >
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          Win probability
        </span>
        <Badge kind="entertainment" />
      </div>
      <div
        className="md-winprob"
        role="img"
        aria-label={`${homeLabel} ${Math.round((home / total) * 100)} percent, draw ${Math.round((draw / total) * 100)} percent, ${awayLabel} ${Math.round((away / total) * 100)} percent`}
      >
        <span style={{ width: pct(home), background: "var(--md-volt)" }} />
        <span style={{ width: pct(draw), background: "var(--md-text-lo)" }} />
        <span style={{ width: pct(away), background: "var(--md-magenta)" }} />
      </div>
      <div
        className="md-small md-tnum"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "var(--space-2)",
          color: "var(--md-text-mid)",
        }}
      >
        <span>
          {homeLabel} {Math.round((home / total) * 100)}%
        </span>
        <span>Draw {Math.round((draw / total) * 100)}%</span>
        <span>
          {awayLabel} {Math.round((away / total) * 100)}%
        </span>
      </div>
    </div>
  );
}
