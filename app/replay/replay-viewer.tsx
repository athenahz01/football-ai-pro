"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { ReplayData, ReplayPoint } from "@/lib/replay/queries";
import { Badge } from "@/components/matchday/badge";

// The 3D replay viewer, restyled as the MATCHDAY replay player. It still reads the
// clip's tracks and per frame positions from the read only endpoint and animates a
// marker per track along the real stored positions with Three.js. The chrome is the
// system's: a header with the 3D TRACKING badge always shown, HUD chips, the control
// row (play, scrub, speed, rotate, fullscreen, show the work), and the system dot
// colours. Positions are image space, normalized to the video frame, not meters, and
// the labels say so. The viewer never writes and runs no model SQL.

type Status = "loading" | "ready" | "empty" | "error";

// System dot colours. Volt is the ball (the on ball focus), teammates are white.
// The open clip carries no team, possession, or goal labels, so every tracked player
// renders white; the system's opponent (dim red) and goal (magenta) colours apply
// once a labelled, calibrated clip exists. Nothing here is invented.
const PLAYER_COLOR = "#f2f4f5";
const BALL_COLOR = "#c6ff00";

const PLANE_DEPTH = 10;
const PLAYER_RADIUS = 0.28;
const BALL_RADIUS = 0.17;
const VIEW_HEIGHT = 460;
const SPEEDS = [0.25, 0.5, 1] as const;

type TrackVisual = {
  mesh: THREE.Mesh;
  frames: Map<number, ReplayPoint>;
  isBall: boolean;
};

export function ReplayViewer({ clipId }: { clipId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState<string>("");

  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [rotating, setRotating] = useState(false);
  const [showWork, setShowWork] = useState(false);

  const playingRef = useRef(false);
  const frameRef = useRef(0);
  const speedRef = useRef<number>(1);
  const rotatingRef = useRef(false);
  const reducedMotionRef = useRef(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const storageKey = `md-replay-playhead:${clipId}`;

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
        if (cancelled) {
          return;
        }
        const hasPoints = payload.tracks.some((track) => track.points.length > 0);
        // Restore the saved playhead for this clip, clamped to the frame range.
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
        if (cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : "Could not load the replay.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [clipId, storageKey]);

  useEffect(() => {
    if (status !== "ready" || data === null) {
      return;
    }
    const mount = mountRef.current;
    if (mount === null) {
      return;
    }

    const fps = data.clip.fps && data.clip.fps > 0 ? data.clip.fps : 24;
    const frameCount = data.frameCount;
    const aspect =
      data.clip.width && data.clip.height && data.clip.height > 0
        ? data.clip.width / data.clip.height
        : 16 / 9;
    const planeWidth = PLANE_DEPTH * aspect;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      queueMicrotask(() => {
        setError(
          "This browser could not start WebGL, so the 3D replay cannot render.",
        );
        setStatus("error");
      });
      return;
    }

    let width = mount.clientWidth || 700;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, VIEW_HEIGHT);
    renderer.setClearColor(0x0e1013, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / VIEW_HEIGHT, 0.1, 200);

    // Camera orbits the centre on the xz plane. The radius and height come from the
    // resting position, and rotate spins the azimuth.
    const camHeight = PLANE_DEPTH * 1.05;
    const camRadius = PLANE_DEPTH * 1.15;
    let angle = 0;
    const applyCamera = () => {
      camera.position.set(
        Math.sin(angle) * camRadius,
        camHeight,
        Math.cos(angle) * camRadius,
      );
      camera.lookAt(0, 0, 0);
    };
    applyCamera();

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(4, 12, 6);
    scene.add(sun);

    // A dark ground plane and grid, MATCHDAY surfaces. Deliberately not pitch green,
    // because this is image space, not a real pitch.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(planeWidth, PLANE_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0x14171b }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const grid = new THREE.GridHelper(
      Math.max(planeWidth, PLANE_DEPTH),
      12,
      0x23272d,
      0x1d2126,
    );
    scene.add(grid);

    const toWorld = (point: ReplayPoint, radius: number) =>
      new THREE.Vector3(
        (point.x - 0.5) * planeWidth,
        radius,
        (point.y - 0.5) * PLANE_DEPTH,
      );

    const visuals: TrackVisual[] = [];
    for (const track of data.tracks) {
      if (track.points.length === 0) {
        continue;
      }
      const isBall = track.trackClass === "ball";
      const radius = isBall ? BALL_RADIUS : PLAYER_RADIUS;
      const color = isBall ? BALL_COLOR : PLAYER_COLOR;

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 16),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(color),
          emissiveIntensity: isBall ? 0.5 : 0.12,
        }),
      );
      mesh.visible = false;
      scene.add(mesh);

      const frames = new Map<number, ReplayPoint>();
      for (const point of track.points) {
        frames.set(point.frame, point);
      }
      visuals.push({ mesh, frames, isBall });
    }

    const placeMarkers = (currentFrame: number) => {
      const rounded = Math.round(currentFrame);
      for (const visual of visuals) {
        const point = visual.frames.get(rounded);
        if (point === undefined) {
          visual.mesh.visible = false;
          continue;
        }
        visual.mesh.visible = true;
        visual.mesh.position.copy(
          toWorld(point, visual.isBall ? BALL_RADIUS : PLAYER_RADIUS),
        );
      }
    };

    const handleResize = () => {
      width = mount.clientWidth || width;
      renderer.setSize(width, VIEW_HEIGHT);
      camera.aspect = width / VIEW_HEIGHT;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    let raf = 0;
    let lastReported = -1;
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (playingRef.current && frameCount > 1) {
        frameRef.current =
          (frameRef.current + delta * fps * speedRef.current) % frameCount;
      }

      // Rotate is an auto-pan, so it is suppressed under reduced motion; the user can
      // still scrub and play.
      if (rotatingRef.current && !reducedMotionRef.current) {
        angle += delta * 0.4;
      }
      applyCamera();

      placeMarkers(frameRef.current);
      renderer.render(scene, camera);

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
      window.removeEventListener("resize", handleResize);
      try {
        window.localStorage.setItem(
          storageKey,
          String(Math.floor(frameRef.current)),
        );
      } catch {
        // Ignore storage failures; the playhead is a convenience.
      }
      renderer.domElement.remove();
      renderer.dispose();
      for (const visual of visuals) {
        visual.mesh.geometry.dispose();
        (visual.mesh.material as THREE.Material).dispose();
      }
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
    };
  }, [status, data, storageKey]);

  if (status === "loading") {
    return (
      <p className="md-small" style={{ color: "var(--md-text-mid)" }}>
        Loading the replay.
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
    if (!next) {
      persist();
    }
  };

  const onScrub = (value: number) => {
    playingRef.current = false;
    setPlaying(false);
    frameRef.current = value;
    setFrame(value);
    persist();
  };

  const cycleSpeed = () => {
    const index = SPEEDS.indexOf(speed);
    const next = SPEEDS[(index + 1) % SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
  };

  const toggleRotate = () => {
    const next = !rotatingRef.current;
    rotatingRef.current = next;
    setRotating(next);
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

  return (
    <section>
      <div className="md-replay-header">
        <div>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
            Our tracking
          </span>
          <h2 className="md-title" style={{ margin: "2px 0 0" }}>
            {data.clip.clipName}
          </h2>
        </div>
        <Badge kind="tracking" />
      </div>

      <div className="md-replay-stage" ref={stageRef}>
        <div ref={mountRef} style={{ width: "100%", height: `${VIEW_HEIGHT}px` }} />
        <div className="md-hud">
          <span className="md-hud-chip">
            Time <span className="v md-ltr">{seconds}s</span>
          </span>
          <span className="md-hud-chip">
            Frame{" "}
            <span className="v md-ltr">
              {frame} / {data.frameCount - 1}
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
          max={Math.max(0, data.frameCount - 1)}
          value={frame}
          onChange={(event) => onScrub(Number(event.target.value))}
          aria-label="Frame scrubber"
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
          className={`md-btn md-btn--${rotating ? "primary" : "secondary"} md-btn--sm`}
          onClick={toggleRotate}
          aria-pressed={rotating}
        >
          Rotate
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
          {"✓"} {showWork ? "Hide the work" : "Show the work"}
        </button>
      </div>

      <div className="md-legend">
        <span>
          <span className="md-legend-dot" style={{ background: BALL_COLOR }} /> ball (
          {balls})
        </span>
        <span>
          <span className="md-legend-dot" style={{ background: PLAYER_COLOR }} />{" "}
          tracked players ({players})
        </span>
      </div>

      {showWork ? (
        <div className="md-panel" style={{ marginTop: "var(--space-4)" }}>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
            The proof
          </span>
          <p className="md-small" style={{ color: "var(--md-text-mid)", marginTop: "var(--space-2)" }}>
            This replay reads {data.tracks.length} stored{" "}
            {data.tracks.length === 1 ? "track" : "tracks"} over {data.frameCount}{" "}
            frames for this clip through the fixed read only query path, source{" "}
            {data.clip.source}. It shows only those stored positions and writes
            nothing.
          </p>
          <p className="md-small" style={{ marginTop: "var(--space-2)" }}>
            <a
              href={`/api/replay?clip=${encodeURIComponent(clipId)}`}
              style={{ color: "var(--md-volt)" }}
            >
              Open the stored data
            </a>
          </p>
        </div>
      ) : null}

      <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: "var(--space-4)" }}>
        Positions are image space, normalized to the {data.clip.width ?? "?"} by{" "}
        {data.clip.height ?? "?"} video frame, not a real pitch in meters. This clip
        is {data.clip.calibrated ? "calibrated" : "not calibrated"}.
      </p>

      <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: "var(--space-2)" }}>
        Source clip: {data.clip.clipName}
        {data.clip.author ? `, ${data.clip.author}` : ""}
        {data.clip.license ? `, ${data.clip.license}` : ""}
        {data.clip.licenseUrl ? (
          <>
            {" "}
            (
            <a href={data.clip.licenseUrl} style={{ color: "var(--md-text-mid)" }}>
              license
            </a>
            )
          </>
        ) : null}
        . Tracking is our own, source {data.clip.source}.
      </p>
    </section>
  );
}
