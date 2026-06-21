"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { ReplayData, ReplayPoint } from "@/lib/replay/queries";

// The 3D replay viewer. It reads a clip's tracks and per frame positions from the
// read only endpoint, then animates a marker per track along the real stored
// positions with a Three.js scene. Players are coloured spheres, the ball is a
// distinct smaller orange sphere. The positions are image space, normalized to the
// video frame, not meters, and the footer says so. The viewer never writes and runs
// no model SQL, it only renders what the loader stored.

type Status = "loading" | "ready" | "empty" | "error";

// Distinct colours for the player markers, reused in order. The ball has its own
// colour below and is never drawn with these.
const PLAYER_COLORS = [
  "#1d4ed8",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#c026d3",
  "#15803d",
];
const BALL_COLOR = "#f59e0b";

const PLANE_DEPTH = 10;
const PLAYER_RADIUS = 0.28;
const BALL_RADIUS = 0.17;
const VIEW_HEIGHT = 440;

type TrackVisual = {
  mesh: THREE.Mesh;
  frames: Map<number, ReplayPoint>;
  isBall: boolean;
};

export function ReplayViewer({ clipId }: { clipId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState<string>("");

  // Playback UI state. The render loop reads the refs so it never goes stale, and
  // mirrors the current frame into React state to drive the scrubber and labels.
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const playingRef = useRef(false);
  const frameRef = useRef(0);

  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state when the clip changes. Deferred so it does not run
    // synchronously inside the effect body.
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
        setData(payload);
        setStatus(hasPoints && payload.frameCount > 0 ? "ready" : "empty");
        setPlaying(false);
        setFrame(0);
        playingRef.current = false;
        frameRef.current = 0;
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
  }, [clipId]);

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
      // Deferred so the state change does not run synchronously inside the effect.
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
    renderer.setClearColor(0xf5f6f8, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / VIEW_HEIGHT, 0.1, 200);
    camera.position.set(0, PLANE_DEPTH * 1.05, PLANE_DEPTH * 1.15);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(4, 12, 6);
    scene.add(sun);

    // A neutral ground plane and grid. It is deliberately not pitch green, because
    // this is image space, not a real pitch.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(planeWidth, PLANE_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0xced3da }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const grid = new THREE.GridHelper(
      Math.max(planeWidth, PLANE_DEPTH),
      12,
      0x9aa1ac,
      0xc2c7d0,
    );
    scene.add(grid);

    // Map normalized image space (x right, y down) to the ground plane. Image y
    // becomes depth into the scene, and the marker sits on top of the plane.
    const toWorld = (point: ReplayPoint, radius: number) =>
      new THREE.Vector3(
        (point.x - 0.5) * planeWidth,
        radius,
        (point.y - 0.5) * PLANE_DEPTH,
      );

    const visuals: TrackVisual[] = [];
    let playerIndex = 0;
    for (const track of data.tracks) {
      if (track.points.length === 0) {
        continue;
      }
      const isBall = track.trackClass === "ball";
      const radius = isBall ? BALL_RADIUS : PLAYER_RADIUS;
      const color = isBall
        ? BALL_COLOR
        : PLAYER_COLORS[playerIndex++ % PLAYER_COLORS.length];

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 16),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(color),
          emissiveIntensity: isBall ? 0.4 : 0.15,
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
          // Honest gap: a track with no position at this frame is simply hidden.
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
        frameRef.current = (frameRef.current + delta * fps) % frameCount;
      }

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
  }, [status, data]);

  if (status === "loading") {
    return <p style={styles.note}>Loading the replay.</p>;
  }

  if (status === "error") {
    return <p style={styles.error}>{error}</p>;
  }

  if (status === "empty" || data === null) {
    return (
      <p style={styles.note}>
        This clip has no stored positions, so there is nothing to replay.
      </p>
    );
  }

  const fps = data.clip.fps && data.clip.fps > 0 ? data.clip.fps : 24;
  const seconds = (frame / fps).toFixed(2);
  const players = data.tracks.filter((track) => track.trackClass !== "ball").length;
  const balls = data.tracks.filter((track) => track.trackClass === "ball").length;

  const togglePlay = () => {
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
  };

  const onScrub = (value: number) => {
    playingRef.current = false;
    setPlaying(false);
    frameRef.current = value;
    setFrame(value);
  };

  return (
    <section>
      <div ref={mountRef} style={styles.canvas} />

      <div style={styles.controls}>
        <button type="button" onClick={togglePlay} style={styles.playButton}>
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, data.frameCount - 1)}
          value={frame}
          onChange={(event) => onScrub(Number(event.target.value))}
          style={styles.scrubber}
          aria-label="Frame scrubber"
        />
        <span style={styles.frameLabel}>
          frame {frame} / {data.frameCount - 1}, {seconds}s
        </span>
      </div>

      <div style={styles.legend}>
        <span>
          <span style={{ ...styles.dot, background: PLAYER_COLORS[0] }} /> tracked
          players ({players})
        </span>
        <span>
          <span style={{ ...styles.dot, background: BALL_COLOR }} /> ball ({balls})
        </span>
      </div>

      <p style={styles.units}>
        Positions are image space, normalized to the {data.clip.width ?? "?"} by{" "}
        {data.clip.height ?? "?"} video frame, not a real pitch in meters. This clip
        is {data.clip.calibrated ? "calibrated" : "not calibrated"}.
      </p>

      <p style={styles.credit}>
        Source clip: {data.clip.clipName}
        {data.clip.author ? `, ${data.clip.author}` : ""}
        {data.clip.license ? `, ${data.clip.license}` : ""}
        {data.clip.licenseUrl ? (
          <>
            {" "}
            (
            <a href={data.clip.licenseUrl} style={styles.link}>
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

const styles: Record<string, React.CSSProperties> = {
  canvas: {
    width: "100%",
    height: `${VIEW_HEIGHT}px`,
    borderRadius: "10px",
    overflow: "hidden",
    border: "1px solid #e2e2e2",
    background: "#f5f6f8",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginTop: "12px",
    flexWrap: "wrap",
  },
  playButton: {
    padding: "8px 18px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#111",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  scrubber: { flex: 1, minWidth: "180px" },
  frameLabel: { fontSize: "13px", color: "#666", fontVariantNumeric: "tabular-nums" },
  legend: {
    display: "flex",
    gap: "20px",
    marginTop: "12px",
    fontSize: "13px",
    color: "#555",
  },
  dot: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    marginRight: "6px",
    verticalAlign: "middle",
  },
  units: { fontSize: "13px", color: "#555", marginTop: "16px", lineHeight: 1.5 },
  credit: { fontSize: "12px", color: "#888", marginTop: "8px", lineHeight: 1.5 },
  note: { fontSize: "14px", color: "#555", marginTop: "16px" },
  error: { fontSize: "14px", color: "#b00020", marginTop: "16px" },
  link: { color: "#555" },
};
