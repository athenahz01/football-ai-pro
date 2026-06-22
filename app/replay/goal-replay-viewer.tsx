"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/matchday/badge";
import type {
  GoalReplayData,
  GoalReplayEvent,
  GoalReplaySummary,
} from "@/lib/replay/queries";

type Status = "loading" | "ready" | "empty" | "error";
type TimelinePoint = { frame: number; x: number; y: number };

const FIELD_W = 120;
const FIELD_H = 80;
const FRAMES_PER_SEGMENT = 18;
const TRAIL_POINTS = 26;
const SPEEDS = [0.5, 1, 1.5] as const;

export function GoalReplayViewer({ goalId }: { goalId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<GoalReplayData | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [following, setFollowing] = useState(false);
  const [showWork, setShowWork] = useState(false);
  const [reduced, setReduced] = useState(false);

  const playingRef = useRef(false);
  const frameRef = useRef(0);
  const speedRef = useRef<number>(1);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const storageKey = `md-goal-replay-playhead:${goalId}`;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setStatus("loading");
        setData(null);
      }
    });

    fetch(`/api/replay?goal=${encodeURIComponent(goalId)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`The replay endpoint returned ${response.status}.`);
        }
        return (await response.json()) as GoalReplayData;
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        const timeline = buildTimeline(payload.events);
        let startFrame = 0;
        try {
          const saved = Number(window.localStorage.getItem(storageKey));
          if (Number.isFinite(saved) && saved >= 0 && saved < timeline.length) {
            startFrame = Math.floor(saved);
          }
        } catch {
          startFrame = 0;
        }

        setData(payload);
        setStatus(timeline.length > 0 ? "ready" : "empty");
        setPlaying(false);
        setFrame(startFrame);
        playingRef.current = false;
        frameRef.current = startFrame;
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setError(
          caught instanceof Error ? caught.message : "Could not load the goal.",
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [goalId, storageKey]);

  const timeline = useMemo(
    () => (data ? buildTimeline(data.events) : []),
    [data],
  );
  const shot = data ? goalEvent(data.events) : null;
  const trailPoints = data ? realTrailPoints(data.events) : [];
  const current = timeline[Math.min(frame, Math.max(0, timeline.length - 1))];
  const maxFrame = Math.max(0, timeline.length - 1);

  useEffect(() => {
    if (status !== "ready" || timeline.length === 0) {
      return;
    }

    let raf = 0;
    let last = performance.now();
    let lastReported = -1;

    const tick = () => {
      const now = performance.now();
      const delta = (now - last) / 1000;
      last = now;

      if (playingRef.current && timeline.length > 1) {
        const next = frameRef.current + delta * 24 * speedRef.current;
        frameRef.current = next >= maxFrame ? 0 : next;
      }

      const display = Math.floor(frameRef.current);
      if (display !== lastReported) {
        lastReported = display;
        setFrame(display);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      persistFrame(storageKey, frameRef.current);
    };
  }, [maxFrame, status, storageKey, timeline.length]);

  if (status === "loading") {
    return (
      <p className="md-small" style={{ color: "var(--md-text-mid)" }}>
        Loading the goal replay.
      </p>
    );
  }

  if (status === "error") {
    return (
      <p className="md-small" style={{ color: "var(--md-down)" }}>
        {error}
      </p>
    );
  }

  if (status === "empty" || data === null || current === undefined) {
    return (
      <p className="md-small" style={{ color: "var(--md-text-mid)" }}>
        This goal has no stored event coordinates, so there is no rich replay to
        draw.
      </p>
    );
  }

  let panX = 0;
  let panY = 0;
  if (following && !reduced) {
    panX = FIELD_W / 2 - current.x;
    panY = FIELD_H / 2 - current.y;
  }

  const togglePlay = () => {
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
    if (!next) {
      persistFrame(storageKey, frameRef.current);
    }
  };

  const onScrub = (value: number) => {
    playingRef.current = false;
    setPlaying(false);
    frameRef.current = value;
    setFrame(value);
    persistFrame(storageKey, value);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
  };

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stage.requestFullscreen?.();
    }
  };

  const currentEventIndex = eventIndexForFrame(data.events, frame);
  const currentEvent = data.events[currentEventIndex] ?? data.events[0];
  const activeTrail = timeline
    .slice(Math.max(0, frame - TRAIL_POINTS), frame + 1)
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");

  return (
    <section>
      <div className="md-replay-header">
        <div>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
            Real World Cup goal
          </span>
          <h2 className="md-title" style={{ margin: "2px 0 0" }}>
            {headline(data.goal)}
          </h2>
        </div>
        <div
          style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}
        >
          <Badge kind="grounded">Real event rows</Badge>
          {data.goal.xtGained !== null ? (
            <span className="md-hud-chip">
              XT Gained{" "}
              <span className="v md-ltr">
                {formatSigned(data.goal.xtGained)}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="md-replay-stage md-goal-stage"
        ref={stageRef}
        style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}
      >
        <svg
          viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
          width="100%"
          height="100%"
          role="img"
          aria-label={`Goal replay for ${data.goal.scorer}`}
        >
          <defs>
            <filter
              id="md-goal-glow"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="1.1" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <Pitch />

          <g transform={`translate(${panX} ${panY})`}>
            {trailPoints.length > 1 ? (
              <polyline
                points={trailPoints
                  .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
                  .join(" ")}
                fill="none"
                stroke="var(--md-volt)"
                strokeWidth={0.9}
                strokeDasharray="2.4 2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.48}
              />
            ) : null}

            {activeTrail.length > 0 ? (
              <polyline
                points={activeTrail}
                fill="none"
                stroke="var(--md-volt)"
                strokeWidth={1.45}
                strokeDasharray="3 2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#md-goal-glow)"
                style={
                  playing && !reduced
                    ? { animation: "md-trail-dash 600ms linear infinite" }
                    : undefined
                }
              />
            ) : null}

            {shot && shot.endX !== null && shot.endY !== null ? (
              <line
                x1={shot.x}
                y1={shot.y}
                x2={shot.endX}
                y2={shot.endY}
                stroke="var(--md-magenta)"
                strokeWidth={1.2}
                strokeLinecap="round"
                opacity={0.92}
              />
            ) : null}

            {data.events.map((event, index) => (
              <circle
                key={event.eventId}
                cx={event.x}
                cy={event.y}
                r={event.isGoal ? 1.75 : 0.95}
                fill={event.isGoal ? "#f2f4f5" : "var(--md-volt)"}
                opacity={event.isGoal ? 1 : 0.5}
                stroke={event.isGoal ? "var(--md-magenta)" : "transparent"}
                strokeWidth={event.isGoal ? 0.55 : 0}
                aria-label={`${index + 1}. ${event.type}`}
              />
            ))}

            <circle
              cx={current.x}
              cy={current.y}
              r={1.65}
              fill="var(--md-volt)"
              filter="url(#md-goal-glow)"
            />
          </g>
        </svg>

        <div className="md-hud">
          <span className="md-hud-chip">
            Event{" "}
            <span className="v md-ltr">
              {currentEventIndex + 1} / {data.events.length}
            </span>
          </span>
          <span className="md-hud-chip">
            {currentEvent.type}{" "}
            <span className="v md-ltr">
              {displayMinute(currentEvent.minute)}
            </span>
          </span>
        </div>
      </div>

      <div className="md-replay-controls">
        <button
          type="button"
          className="md-btn md-btn--primary md-btn--sm"
          onClick={togglePlay}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          className="md-scrub"
          min={0}
          max={maxFrame}
          value={frame}
          onChange={(event) => onScrub(Number(event.target.value))}
          aria-label="Goal replay scrubber"
        />
        <button
          type="button"
          className="md-btn md-btn--secondary md-btn--sm"
          onClick={cycleSpeed}
          aria-label={`Playback speed ${speed} times`}
        >
          <span className="md-ltr">{speed}x</span>
        </button>
        <button
          type="button"
          className={`md-btn md-btn--${following ? "primary" : "secondary"} md-btn--sm`}
          onClick={() => setFollowing((value) => !value)}
          aria-pressed={following}
        >
          Follow
        </button>
        <button
          type="button"
          className="md-btn md-btn--secondary md-btn--sm"
          onClick={toggleFullscreen}
        >
          Fullscreen
        </button>
        <button
          type="button"
          className="md-btn md-btn--ghost md-btn--sm"
          onClick={() => setShowWork((value) => !value)}
          aria-expanded={showWork}
        >
          {showWork ? "Hide the work" : "Show the work"}
        </button>
      </div>

      <div className="md-legend">
        <span>
          <span
            className="md-legend-dot"
            style={{ background: "var(--md-volt)" }}
          />{" "}
          real ball path
        </span>
        <span>
          <span
            className="md-legend-dot"
            style={{ background: "var(--md-magenta)" }}
          />{" "}
          shot to goal
        </span>
        <span>
          <span className="md-legend-dot" style={{ background: "#f2f4f5" }} />{" "}
          scorer touch
        </span>
      </div>

      {showWork ? (
        <div className="md-panel" style={{ marginTop: "var(--space-4)" }}>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
            The proof
          </span>
          <p
            className="md-small"
            style={{ color: "var(--md-text-mid)", marginTop: "var(--space-2)" }}
          >
            The endpoint walks backward from the goal within the same match
            while the possession team stays {data.goal.teamName}, then draws the
            stored event coordinates in sequence. The xT chip sums
            action_values.xt_value for those possession events through
            spadl_actions.source_event_id.
          </p>
          <p
            className="md-small"
            style={{ color: "var(--md-text-lo)", marginTop: "var(--space-2)" }}
          >
            This replay uses {data.events.length} real event rows. It is a
            reconstruction on a stylized pitch, not broadcast footage and not
            scanned player likenesses.
          </p>
          <p className="md-small" style={{ marginTop: "var(--space-2)" }}>
            <a
              href={`/api/replay?goal=${encodeURIComponent(goalId)}`}
              style={{ color: "var(--md-volt)" }}
            >
              Open the stored replay data
            </a>
          </p>
        </div>
      ) : null}

      <p
        className="md-small"
        style={{ color: "var(--md-text-lo)", marginTop: "var(--space-4)" }}
      >
        Opponent positions are not shown because StatsBomb freeze-frame data is
        not loaded yet. A later freeze-frame load can add surrounding players.
      </p>
    </section>
  );
}

function Pitch() {
  const stripeCount = 12;
  return (
    <g>
      <rect width={FIELD_W} height={FIELD_H} fill="#183d25" />
      {Array.from({ length: stripeCount }, (_, index) => (
        <rect
          key={index}
          x={(FIELD_W / stripeCount) * index}
          y={0}
          width={FIELD_W / stripeCount}
          height={FIELD_H}
          fill={index % 2 === 0 ? "#245d35" : "#1f5330"}
          opacity={0.7}
        />
      ))}
      <g fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth={0.45}>
        <rect x={0.4} y={0.4} width={FIELD_W - 0.8} height={FIELD_H - 0.8} />
        <line x1={FIELD_W / 2} y1={0.4} x2={FIELD_W / 2} y2={FIELD_H - 0.4} />
        <circle cx={FIELD_W / 2} cy={FIELD_H / 2} r={9.15} />
        <rect x={0.4} y={18} width={18} height={44} />
        <rect x={101.6} y={18} width={18} height={44} />
        <rect x={0.4} y={30} width={6} height={20} />
        <rect x={113.6} y={30} width={6} height={20} />
        <line
          x1={119.4}
          y1={34}
          x2={119.4}
          y2={46}
          stroke="var(--md-magenta)"
        />
      </g>
    </g>
  );
}

function buildTimeline(events: GoalReplayEvent[]): TimelinePoint[] {
  const points = realTrailPoints(events);
  if (points.length === 0) {
    return [];
  }

  if (points.length === 1) {
    return [{ frame: 0, x: points[0].x, y: points[0].y }];
  }

  const timeline: TimelinePoint[] = [];
  let frame = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    for (let step = 0; step < FRAMES_PER_SEGMENT; step += 1) {
      const t = step / FRAMES_PER_SEGMENT;
      timeline.push({
        frame,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      frame += 1;
    }
  }

  const last = points[points.length - 1];
  timeline.push({ frame, x: last.x, y: last.y });
  return timeline;
}

function realTrailPoints(
  events: GoalReplayEvent[],
): { x: number; y: number }[] {
  const points = events.map((event) => ({ x: event.x, y: event.y }));
  const shotEvent = goalEvent(events);
  if (shotEvent && shotEvent.endX !== null && shotEvent.endY !== null) {
    points.push({ x: shotEvent.endX, y: shotEvent.endY });
  }
  return points;
}

function goalEvent(events: GoalReplayEvent[]): GoalReplayEvent | null {
  return events.find((event) => event.isGoal) ?? null;
}

function eventIndexForFrame(events: GoalReplayEvent[], frame: number): number {
  if (events.length <= 1) {
    return 0;
  }
  return Math.min(events.length - 1, Math.floor(frame / FRAMES_PER_SEGMENT));
}

function persistFrame(storageKey: string, value: number): void {
  try {
    window.localStorage.setItem(storageKey, String(Math.floor(value)));
  } catch {
    return;
  }
}

function headline(goal: GoalReplaySummary): string {
  return `${goal.scorer.toUpperCase()} | GOAL, ${displayMinute(goal.minute)} ${teamCode(
    goal.homeTeamName,
  )} v ${teamCode(goal.awayTeamName)}`;
}

function displayMinute(minute: number): string {
  return `${minute + 1}'`;
}

function teamCode(name: string): string {
  const known: Record<string, string> = {
    Argentina: "ARG",
    France: "FRA",
    England: "ENG",
    Iran: "IRN",
    Ecuador: "ECU",
    Qatar: "QAT",
    Netherlands: "NED",
    Senegal: "SEN",
    "United States": "USA",
    Wales: "WAL",
    Australia: "AUS",
    "Saudi Arabia": "KSA",
  };
  return (
    known[name] ??
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase()
  );
}

function formatSigned(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}
