// Pitch and zone map primitive, lightweight SVG. Pitch greens from the system, lines
// white at low opacity, heat as Volt at low opacity, events as solid Volt or magenta
// (magenta for a goal action). Coordinates are StatsBomb pitch space: x from 0 to 120
// along the length, y from 0 to 80 across the width.
//
// This primitive is built to spec and ready to use on any screen that already carries
// pitch coordinates. It is intentionally not forced onto a screen here: the current
// read only query layers surface aggregates and image space tracks, not raw shot or
// event x/y, and adding a query to feed it would be a backend change, which this
// redesign does not make. It renders only the real points it is given.

export type PitchPoint = {
  x: number;
  y: number;
  kind?: "event" | "goal";
  intensity?: number;
};

export function PitchMap({
  events = [],
  heat = [],
  title = "Pitch map",
}: {
  events?: PitchPoint[];
  heat?: PitchPoint[];
  title?: string;
}) {
  const line = "rgba(255,255,255,0.22)";
  return (
    <svg
      viewBox="0 0 120 80"
      role="img"
      aria-label={title}
      style={{
        width: "100%",
        height: "auto",
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--md-border)",
        background: "#0c1612",
      }}
    >
      <title>{title}</title>

      {/* Heat first, so events sit on top. Volt at low opacity. */}
      {heat.map((point, index) => (
        <circle
          key={`heat-${index}`}
          cx={point.x}
          cy={point.y}
          r={6}
          fill="var(--md-volt)"
          opacity={Math.max(0.04, Math.min(0.28, point.intensity ?? 0.12))}
        />
      ))}

      {/* Pitch markings. */}
      <g fill="none" stroke={line} strokeWidth={0.4}>
        <rect x={1} y={1} width={118} height={78} />
        <line x1={60} y1={1} x2={60} y2={79} />
        <circle cx={60} cy={40} r={9.15} />
        <rect x={1} y={18} width={16.5} height={44} />
        <rect x={102.5} y={18} width={16.5} height={44} />
        <rect x={1} y={30} width={5.5} height={20} />
        <rect x={113.5} y={30} width={5.5} height={20} />
      </g>
      <g fill={line}>
        <circle cx={60} cy={40} r={0.5} />
        <circle cx={12} cy={40} r={0.5} />
        <circle cx={108} cy={40} r={0.5} />
      </g>

      {/* Events. Solid Volt, magenta for a goal action. */}
      {events.map((point, index) => (
        <circle
          key={`event-${index}`}
          cx={point.x}
          cy={point.y}
          r={1.4}
          fill={point.kind === "goal" ? "var(--md-magenta)" : "var(--md-volt)"}
        />
      ))}
    </svg>
  );
}
