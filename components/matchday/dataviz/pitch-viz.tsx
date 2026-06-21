"use client";

import { useMemo, useState } from "react";

import type { ShotEvent, PassEvent } from "@/lib/insights/pitch";

// The PitchViz family in MATCHDAY style, lightweight SVG over real StatsBomb event
// coordinates. Shot map (goals distinct, sized by expected goals), pass map (completed
// versus incomplete), and a heat map (event density as Volt at low opacity), with a
// completed only toggle and a timeline scrubber that reveals events up to a minute, and
// live counts beside the pitch. It renders only the real events it is given; an empty
// set shows an honest note, never invented events.

type Mode = "shots" | "passes" | "heat";

export type PitchHighlight = {
  x: number;
  y: number;
  endX?: number | null;
  endY?: number | null;
  goal?: boolean;
};

export function PitchViz({
  shots,
  passes,
  defaultMode = "shots",
  highlight,
  title = "Pitch map",
}: {
  shots: ShotEvent[];
  passes: PassEvent[];
  defaultMode?: Mode;
  highlight?: PitchHighlight | null;
  title?: string;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [completedOnly, setCompletedOnly] = useState(false);

  const maxMinute = useMemo(() => {
    const minutes = [
      ...shots.map((shot) => shot.minute ?? 0),
      ...passes.map((pass) => pass.minute ?? 0),
    ];
    return minutes.length > 0 ? Math.max(...minutes) : 0;
  }, [shots, passes]);

  const [minute, setMinute] = useState<number>(maxMinute);

  const upTo = (m: number | null) => m === null || m <= minute;

  const visibleShots = shots.filter((shot) => upTo(shot.minute));
  const visiblePasses = passes
    .filter((pass) => upTo(pass.minute))
    .filter((pass) => (completedOnly ? pass.completed : true));

  const heatPoints =
    mode === "heat"
      ? [
          ...visibleShots.map((shot) => ({ x: shot.x, y: shot.y })),
          ...passes.filter((pass) => upTo(pass.minute)).map((pass) => ({ x: pass.x, y: pass.y })),
        ]
      : [];

  const goals = visibleShots.filter((shot) => shot.goal).length;
  const completed = visiblePasses.filter((pass) => pass.completed).length;
  const incomplete = visiblePasses.length - completed;

  const empty =
    (mode === "shots" && shots.length === 0) ||
    (mode === "passes" && passes.length === 0) ||
    (mode === "heat" && shots.length + passes.length === 0);

  return (
    <div>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <div className="md-seg" role="group" aria-label="Pitch view">
          {(["shots", "passes", "heat"] as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              className="md-seg-item"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "shots" ? "Shots" : value === "passes" ? "Passes" : "Heat"}
            </button>
          ))}
        </div>
        {mode === "passes" ? (
          <button
            type="button"
            className={`md-chip ${completedOnly ? "md-chip--active" : ""}`}
            aria-pressed={completedOnly}
            onClick={() => setCompletedOnly((value) => !value)}
          >
            Completed only
          </button>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-4)" }} className="md-pitchviz-grid">
        <div>
          <svg viewBox="0 0 120 80" width="100%" height="auto" role="img" aria-label={title} style={{ borderRadius: "var(--r-lg)", border: "1px solid var(--md-border)", background: "#0c1612" }}>
            <defs>
              <marker id="md-pass-head" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 z" fill="var(--md-volt)" />
              </marker>
              <marker id="md-pass-head-out" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 z" fill="var(--md-down)" />
              </marker>
            </defs>
            <PitchMarkings />

            {mode === "heat"
              ? heatPoints.map((point, index) => (
                  <circle key={`h-${index}`} cx={point.x} cy={point.y} r={5} fill="var(--md-volt)" opacity={0.06} />
                ))
              : null}

            {mode === "passes"
              ? visiblePasses.map((pass, index) => (
                  <line
                    key={`p-${index}`}
                    x1={pass.x}
                    y1={pass.y}
                    x2={pass.endX}
                    y2={pass.endY}
                    stroke={pass.completed ? "var(--md-volt)" : "var(--md-down)"}
                    strokeWidth={0.5}
                    opacity={pass.completed ? 0.85 : 0.7}
                    markerEnd={pass.completed ? "url(#md-pass-head)" : "url(#md-pass-head-out)"}
                  />
                ))
              : null}

            {mode === "shots"
              ? visibleShots.map((shot, index) => {
                  const r = 1 + Math.min(3, (shot.xg ?? 0.05) * 6);
                  return (
                    <circle
                      key={`s-${index}`}
                      cx={shot.x}
                      cy={shot.y}
                      r={r}
                      fill={shot.goal ? "var(--md-magenta)" : "var(--md-volt)"}
                      opacity={shot.goal ? 0.95 : 0.6}
                      stroke={shot.goal ? "#ffffff" : "none"}
                      strokeWidth={shot.goal ? 0.3 : 0}
                    />
                  );
                })
              : null}

            {highlight ? (
              <g>
                {highlight.endX != null && highlight.endY != null ? (
                  <line x1={highlight.x} y1={highlight.y} x2={highlight.endX} y2={highlight.endY} stroke="#ffffff" strokeWidth={0.7} markerEnd="url(#md-pass-head)" />
                ) : null}
                <circle cx={highlight.x} cy={highlight.y} r={3} fill="none" stroke="#ffffff" strokeWidth={0.6} />
                <circle cx={highlight.x} cy={highlight.y} r={1.4} fill={highlight.goal ? "var(--md-magenta)" : "var(--md-volt)"} />
              </g>
            ) : null}
          </svg>
          {empty ? (
            <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: "var(--space-2)" }}>
              No {mode === "passes" ? "passes" : "shots"} with coordinates are available here.
            </p>
          ) : (
            <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: "var(--space-2)" }}>
              Real StatsBomb event coordinates. Attacking left to right.{" "}
              {mode === "shots" ? "Magenta marks a goal, dot size by expected goals." : null}
            </p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {mode === "shots" ? (
            <>
              <Count label="Shots" value={visibleShots.length} />
              <Count label="Goals" value={goals} accent />
            </>
          ) : mode === "passes" ? (
            <>
              <Count label="Complete" value={completed} accent />
              <Count label="Incomplete" value={incomplete} />
              <Count label="Total" value={visiblePasses.length} />
            </>
          ) : (
            <Count label="Events" value={heatPoints.length} />
          )}
        </div>
      </div>

      {maxMinute > 0 ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>Timeline</span>
            <span className="md-small md-tnum" style={{ color: "var(--md-text-mid)" }}>up to {minute}&apos;</span>
          </div>
          <input
            type="range"
            className="md-scrub"
            min={0}
            max={maxMinute}
            value={minute}
            onChange={(event) => setMinute(Number(event.target.value))}
            aria-label="Reveal events up to minute"
            style={{ width: "100%" }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Count({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-3)", borderBottom: "1px solid var(--md-hairline)", paddingBottom: "6px" }}>
      <span className="md-small" style={{ color: "var(--md-text-mid)" }}>{label}</span>
      <span className="md-stat-xl md-ltr" style={{ fontSize: "22px", color: accent ? "var(--md-volt)" : "var(--md-text-hi)" }}>{value}</span>
    </div>
  );
}

function PitchMarkings() {
  const line = "rgba(255,255,255,0.22)";
  return (
    <g fill="none" stroke={line} strokeWidth={0.4}>
      <rect x={1} y={1} width={118} height={78} />
      <line x1={60} y1={1} x2={60} y2={79} />
      <circle cx={60} cy={40} r={9.15} />
      <rect x={1} y={18} width={16.5} height={44} />
      <rect x={102.5} y={18} width={16.5} height={44} />
      <rect x={1} y={30} width={5.5} height={20} />
      <rect x={113.5} y={30} width={5.5} height={20} />
      <circle cx={60} cy={40} r={0.5} fill={line} />
      <circle cx={12} cy={40} r={0.5} fill={line} />
      <circle cx={108} cy={40} r={0.5} fill={line} />
    </g>
  );
}
