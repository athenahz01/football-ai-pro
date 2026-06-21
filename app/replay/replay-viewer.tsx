"use client";

import { useEffect, useRef, useState } from "react";

import type { ReplayData, ReplayPoint } from "@/lib/replay/queries";
import { Badge } from "@/components/matchday/badge";

// The MATCHDAY replay, a clean stylized tactical view in lightweight SVG, not 3D
// figures. A stylized pitch in a slight perspective with low opacity markings, players
// as flat dot markers, and the ball as a Volt marker with a glowing dashed motion
// trail tracing its real path across frames. Same real stored positions, read from the
// read only endpoint.
//
// Honesty holds and is stated in the UI: this is our own stylized tracking on an image
// space clip, not footage and not scanned likenesses. The open clip has no team or
// possession labels, so figures render as one neutral styled set with no fabricated
// teams, opponents, or goal action. A calibrated, rights confirmed match clip would
// fill it with real teams and a real pitch with no viewer change.

type Status = "loading" | "ready" | "empty" | "error";

const SPEEDS = [0.25, 0.5, 1] as const;
const TRAIL_FRAMES = 20;

// Perspective stage in SVG units. Image space x is horizontal, image space y is depth
// into the scene (0 far, 1 near).
const STAGE_W = 100;
const STAGE_H = 68;
const TOP_Y = 8;
const BOTTOM_Y = 60;
const TOP_HALF = 26;
const BOTTOM_HALF = 45;

type Projected = { x: number; y: number; scale: number };

function project(nx: number, ny: number): Projected {
  const depth = Math.min(1, Math.max(0, ny));
  const y = TOP_Y + depth * (BOTTOM_Y - TOP_Y);
  const half = TOP_HALF + depth * (BOTTOM_HALF - TOP_HALF);
  const x = STAGE_W / 2 + (nx - 0.5) * 2 * half;
  return { x, y, scale: 0.55 + depth * 0.6 };
}

export function ReplayViewer({ clipId }: { clipId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState<string>("");

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
  const storageKey = `md-replay-playhead:${clipId}`;

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

    fetch(`/api/replay?clip=${encodeURIComponent(clipId)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`The replay endpoint returned ${response.status}.`);
        }
        return (await response.json()) as ReplayData;
      })
      .then((payload) => {
        if (cancelled) return;
        const hasPoints = payload.tracks.some((track) => track.points.length > 0);
        let startFrame = 0;
        try {
          const saved = Number(window.localStorage.getItem(storageKey));
          if (Number.isFinite(saved) && saved > 0 && saved < payload.frameCount) {
            startFrame = Math.floor(saved);
          }
        } catch {
          startFrame = 0;
        }
        setData(payload);
        setStatus(hasPoints && payload.frameCount > 0 ? "ready" : "empty");
        setPlaying(false);
        setFrame(startFrame);
        playingRef.current = false;
        frameRef.current = startFrame;
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not load the replay.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [clipId, storageKey]);

  // Playback loop. Advances the playhead and mirrors the integer frame into state to
  // drive the markers, the scrubber, and the HUD.
  useEffect(() => {
    if (status !== "ready" || data === null) {
      return;
    }
    const fps = data.clip.fps && data.clip.fps > 0 ? data.clip.fps : 24;
    const frameCount = data.frameCount;
    let raf = 0;
    let last = performance.now();
    let lastReported = -1;

    const tick = () => {
      const now = performance.now();
      const delta = (now - last) / 1000;
      last = now;
      if (playingRef.current && frameCount > 1) {
        frameRef.current = (frameRef.current + delta * fps * speedRef.current) % frameCount;
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
      try {
        window.localStorage.setItem(storageKey, String(Math.floor(frameRef.current)));
      } catch {
        // ignore
      }
    };
  }, [status, data, storageKey]);

  if (status === "loading") {
    return <p className="md-small" style={{ color: "var(--md-text-mid)" }}>Loading the replay.</p>;
  }
  if (status === "error") {
    return <p className="md-small" style={{ color: "var(--md-down)" }}>{error}</p>;
  }
  if (status === "empty" || data === null) {
    return (
      <p className="md-small" style={{ color: "var(--md-text-mid)" }}>
        This clip has no stored positions, so there is nothing to replay.
      </p>
    );
  }

  const fps = data.clip.fps && data.clip.fps > 0 ? data.clip.fps : 24;
  const seconds = (frame / fps).toFixed(2);
  const players = data.tracks.filter((track) => track.trackClass !== "ball").length;
  const balls = data.tracks.filter((track) => track.trackClass === "ball").length;

  // Current marker positions and the ball trail at this frame, all from real points.
  const ballTrack = data.tracks.find((track) => track.trackClass === "ball");
  const markers = data.tracks
    .map((track) => {
      const point = pointAt(track.points, frame);
      return point ? { isBall: track.trackClass === "ball", point } : null;
    })
    .filter((value): value is { isBall: boolean; point: ReplayPoint } => value !== null);

  const trail = ballTrack ? trailPath(ballTrack.points, frame) : "";
  const ballNow = ballTrack ? pointAt(ballTrack.points, frame) : null;

  // Follow pans the stage to keep the ball centred, an auto motion suppressed under
  // reduced motion.
  let panX = 0;
  let panY = 0;
  if (following && !reduced && ballNow) {
    const p = project(ballNow.x, ballNow.y);
    panX = STAGE_W / 2 - p.x;
    panY = STAGE_H * 0.55 - p.y;
  }

  const persist = () => {
    try {
      window.localStorage.setItem(storageKey, String(Math.floor(frameRef.current)));
    } catch {
      // ignore
    }
  };
  const togglePlay = () => {
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
    if (!next) persist();
  };
  const onScrub = (value: number) => {
    playingRef.current = false;
    setPlaying(false);
    frameRef.current = value;
    setFrame(value);
    persist();
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
  };
  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (stage === null) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stage.requestFullscreen?.();
    }
  };

  return (
    <section>
      <div className="md-replay-header">
        <div>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>Our stylized tracking</span>
          <h2 className="md-title" style={{ margin: "2px 0 0" }}>{data.clip.clipName}</h2>
        </div>
        <Badge kind="tracking" />
      </div>

      <div className="md-replay-stage" ref={stageRef} style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}`, background: "#0a0b0d" }}>
        <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width="100%" height="100%" role="img" aria-label={`Stylized replay of ${data.clip.clipName}`}>
          <defs>
            <radialGradient id="md-pitch-glow" cx="50%" cy="38%" r="75%">
              <stop offset="0%" stopColor="#2f7a43" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#163d22" stopOpacity="0.9" />
            </radialGradient>
            <filter id="md-ball-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="0.9" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <Pitch />

          <g transform={`translate(${panX} ${panY})`}>
            {trail ? (
              <path
                d={trail}
                fill="none"
                stroke="var(--md-volt)"
                strokeWidth={0.8}
                strokeLinecap="round"
                strokeDasharray="2 2"
                opacity={0.85}
                filter="url(#md-ball-glow)"
                style={
                  playing && !reduced
                    ? { animation: "md-trail-dash 600ms linear infinite" }
                    : undefined
                }
              />
            ) : null}

            {markers.map((marker, index) => {
              const p = project(marker.point.x, marker.point.y);
              if (marker.isBall) {
                return (
                  <circle
                    key={`ball-${index}`}
                    cx={p.x}
                    cy={p.y}
                    r={1.3 * p.scale}
                    fill="var(--md-volt)"
                    filter="url(#md-ball-glow)"
                  />
                );
              }
              return (
                <g key={`player-${index}`}>
                  <ellipse cx={p.x} cy={p.y + 1.2 * p.scale} rx={1.8 * p.scale} ry={0.6 * p.scale} fill="#000000" opacity={0.28} />
                  <circle cx={p.x} cy={p.y} r={1.7 * p.scale} fill="#eef1f3" stroke="#0a0b0d" strokeWidth={0.3} />
                </g>
              );
            })}
          </g>
        </svg>

        <div className="md-hud">
          <span className="md-hud-chip">Time <span className="v md-ltr">{seconds}s</span></span>
          <span className="md-hud-chip">Frame <span className="v md-ltr">{frame} / {data.frameCount - 1}</span></span>
        </div>
      </div>

      <div className="md-replay-controls">
        <button type="button" className="md-btn md-btn--primary md-btn--sm" onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
        <input type="range" className="md-scrub" min={0} max={Math.max(0, data.frameCount - 1)} value={frame} onChange={(event) => onScrub(Number(event.target.value))} aria-label="Frame scrubber" />
        <button type="button" className="md-btn md-btn--secondary md-btn--sm" onClick={cycleSpeed} aria-label={`Playback speed ${speed} times`}><span className="md-ltr">{speed}x</span></button>
        <button type="button" className={`md-btn md-btn--${following ? "primary" : "secondary"} md-btn--sm`} onClick={() => setFollowing((value) => !value)} aria-pressed={following}>Follow</button>
        <button type="button" className="md-btn md-btn--secondary md-btn--sm" onClick={toggleFullscreen}>Fullscreen</button>
        <button type="button" className="md-btn md-btn--ghost md-btn--sm" onClick={() => setShowWork((value) => !value)} aria-expanded={showWork}>{"✓"} {showWork ? "Hide the work" : "Show the work"}</button>
      </div>

      <div className="md-legend">
        <span><span className="md-legend-dot" style={{ background: "var(--md-volt)" }} /> ball with trail ({balls})</span>
        <span><span className="md-legend-dot" style={{ background: "#eef1f3" }} /> tracked players ({players})</span>
      </div>

      {showWork ? (
        <div className="md-panel" style={{ marginTop: "var(--space-4)" }}>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>The proof</span>
          <p className="md-small" style={{ color: "var(--md-text-mid)", marginTop: "var(--space-2)" }}>
            This replay reads {data.tracks.length} stored {data.tracks.length === 1 ? "track" : "tracks"} over {data.frameCount} frames for this clip through the fixed read only query path, source {data.clip.source}. It renders only those stored positions and writes nothing.
          </p>
          <p className="md-small" style={{ marginTop: "var(--space-2)" }}>
            <a href={`/api/replay?clip=${encodeURIComponent(clipId)}`} style={{ color: "var(--md-volt)" }}>Open the stored data</a>
          </p>
        </div>
      ) : null}

      <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: "var(--space-4)" }}>
        Stylized view of our own tracking, not footage and not scanned player likenesses. Positions are image space, normalized to the {data.clip.width ?? "?"} by {data.clip.height ?? "?"} video frame, not calibrated pitch coordinates, so the pitch is an illustrative stage. This clip is {data.clip.calibrated ? "calibrated" : "not calibrated"}.
      </p>
      <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: "var(--space-2)" }}>
        Source clip: {data.clip.clipName}
        {data.clip.author ? `, ${data.clip.author}` : ""}
        {data.clip.license ? `, ${data.clip.license}` : ""}
        {data.clip.licenseUrl ? (<> {" "}(<a href={data.clip.licenseUrl} style={{ color: "var(--md-text-mid)" }}>license</a>)</>) : null}
        . Tracking is our own, source {data.clip.source}.
      </p>
    </section>
  );
}

// The stylized pitch: a perspective trapezoid with mown stripes and low opacity
// markings. An illustrative stage, not a calibrated pitch.
function Pitch() {
  const tl = project(0, 0);
  const tr = project(1, 0);
  const br = project(1, 1);
  const bl = project(0, 1);
  const line = "rgba(255,255,255,0.22)";

  const stripes = [];
  const bands = 8;
  for (let i = 0; i < bands; i += 1) {
    const a = project(0, i / bands);
    const b = project(1, i / bands);
    const c = project(1, (i + 1) / bands);
    const d = project(0, (i + 1) / bands);
    stripes.push(
      <polygon
        key={i}
        points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`}
        fill={i % 2 === 0 ? "#2c7340" : "#256536"}
        opacity={0.55}
      />,
    );
  }

  const box = (nearDepth: number, farDepth: number) => {
    const a = project(0.28, nearDepth);
    const b = project(0.72, nearDepth);
    const c = project(0.72, farDepth);
    const d = project(0.28, farDepth);
    return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
  };
  const center = project(0.5, 0.5);
  const circleR = project(0.5, 0.5).scale * 6;

  return (
    <g>
      <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill="url(#md-pitch-glow)" />
      {stripes}
      <g fill="none" stroke={line} strokeWidth={0.3}>
        <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} />
        <line x1={project(0, 0.5).x} y1={project(0, 0.5).y} x2={project(1, 0.5).x} y2={project(1, 0.5).y} />
        <ellipse cx={center.x} cy={center.y} rx={circleR} ry={circleR * 0.5} />
        <polygon points={box(0.0, 0.14)} />
        <polygon points={box(1.0, 0.86)} />
      </g>
    </g>
  );
}

function pointAt(points: ReplayPoint[], frame: number): ReplayPoint | null {
  for (const point of points) {
    if (point.frame === frame) {
      return point;
    }
  }
  return null;
}

function trailPath(points: ReplayPoint[], frame: number): string {
  const segment: ReplayPoint[] = [];
  for (let f = frame - TRAIL_FRAMES; f <= frame; f += 1) {
    const point = pointAt(points, f);
    if (point) {
      segment.push(point);
    }
  }
  if (segment.length < 2) {
    return "";
  }
  return segment
    .map((point, index) => {
      const p = project(point.x, point.y);
      return `${index === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    })
    .join(" ");
}
