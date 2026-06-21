"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { ReplayData, ReplayPoint } from "@/lib/replay/queries";
import { Badge } from "@/components/matchday/badge";

// The MATCHDAY 3D replay player, a stylized broadcast scene over the same real stored
// tracking. The Three.js rendering and the real positions are unchanged in substance;
// what changed is the look: a grass treatment with pitch markings, stylized player
// figures rather than spheres, a Volt ball with a motion trail, a broadcast camera
// with optional rotate and follow, soft lighting and shadows, and a clean HUD.
//
// Honesty holds and is stated in the UI: this is our own stylized tracking, not
// scanned player likenesses, and the positions are image space, normalized to the
// video frame, not calibrated pitch coordinates, so the pitch is an illustrative
// stage. The open clip carries no team or possession labels, so figures share one
// neutral side and no on ball highlight is fabricated; team colours and an on ball
// highlight apply once a labelled, calibrated clip exists. The viewer writes nothing
// and runs no model SQL.

type Status = "loading" | "ready" | "empty" | "error";

const BALL_COLOR = "#c6ff00";
const PLAYER_COLOR = "#dfe4e8";
const PLANE_DEPTH = 10;
const VIEW_HEIGHT = 480;
const TRAIL_FRAMES = 22;
const SPEEDS = [0.25, 0.5, 1] as const;

type TrackVisual = {
  group: THREE.Object3D;
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
  const [following, setFollowing] = useState(false);
  const [showWork, setShowWork] = useState(false);

  const playingRef = useRef(false);
  const frameRef = useRef(0);
  const speedRef = useRef<number>(1);
  const rotatingRef = useRef(false);
  const followingRef = useRef(false);
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
        setError("This browser could not start WebGL, so the 3D replay cannot render.");
        setStatus("error");
      });
      return;
    }

    let width = mount.clientWidth || 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, VIEW_HEIGHT);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0b0d, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0b0d, PLANE_DEPTH * 1.4, PLANE_DEPTH * 3.2);

    const camera = new THREE.PerspectiveCamera(46, width / VIEW_HEIGHT, 0.1, 200);
    const camHeight = PLANE_DEPTH * 0.92;
    const camRadius = PLANE_DEPTH * 1.08;
    let angle = 0;
    const lookTarget = new THREE.Vector3(0, 0, 0);
    const applyCamera = () => {
      camera.position.set(
        Math.sin(angle) * camRadius,
        camHeight,
        Math.cos(angle) * camRadius,
      );
      camera.lookAt(lookTarget);
    };
    applyCamera();

    // Soft broadcast lighting and a key light that casts shadows.
    scene.add(new THREE.AmbientLight(0x9fb0c0, 0.55));
    const hemi = new THREE.HemisphereLight(0xbfe9ff, 0x0a1a0a, 0.5);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(planeWidth * 0.5, PLANE_DEPTH * 1.4, PLANE_DEPTH * 0.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = PLANE_DEPTH * 5;
    const shadowSpan = Math.max(planeWidth, PLANE_DEPTH) * 0.75;
    key.shadow.camera.left = -shadowSpan;
    key.shadow.camera.right = shadowSpan;
    key.shadow.camera.top = shadowSpan;
    key.shadow.camera.bottom = -shadowSpan;
    scene.add(key);

    // Grass treatment: mown stripes drawn into a canvas texture.
    const grassTexture = makeGrassTexture();
    if (grassTexture) {
      grassTexture.wrapS = THREE.RepeatWrapping;
      grassTexture.wrapT = THREE.RepeatWrapping;
      grassTexture.repeat.set(1, 1);
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(planeWidth, PLANE_DEPTH),
      new THREE.MeshStandardMaterial({
        color: 0x2f7a43,
        map: grassTexture ?? null,
        roughness: 0.95,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Illustrative pitch markings. A stage, not a calibrated pitch.
    const markings = buildMarkings(planeWidth, PLANE_DEPTH);
    scene.add(markings);

    const toWorld = (point: ReplayPoint) =>
      new THREE.Vector3(
        (point.x - 0.5) * planeWidth,
        0,
        (point.y - 0.5) * PLANE_DEPTH,
      );

    const disposables: { dispose: () => void }[] = [];
    const visuals: TrackVisual[] = [];
    let ballVisual: TrackVisual | null = null;

    for (const track of data.tracks) {
      if (track.points.length === 0) {
        continue;
      }
      const isBall = track.trackClass === "ball";
      const group = isBall
        ? buildBall(disposables)
        : buildPlayer(disposables);
      group.visible = false;
      scene.add(group);

      const frames = new Map<number, ReplayPoint>();
      for (const point of track.points) {
        frames.set(point.frame, point);
      }
      const visual: TrackVisual = { group, frames, isBall };
      visuals.push(visual);
      if (isBall) {
        ballVisual = visual;
      }
    }

    // The ball motion trail, a fading Volt line through its recent positions.
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(TRAIL_FRAMES * 3);
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    const trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({ color: 0xc6ff00, transparent: true, opacity: 0.55 }),
    );
    trail.frustumCulled = false;
    scene.add(trail);

    const ballWorld = new THREE.Vector3();

    const placeMarkers = (currentFrame: number) => {
      const rounded = Math.round(currentFrame);
      for (const visual of visuals) {
        const point = visual.frames.get(rounded);
        if (point === undefined) {
          visual.group.visible = false;
          continue;
        }
        visual.group.visible = true;
        const world = toWorld(point);
        visual.group.position.set(world.x, 0, world.z);
        if (visual.isBall) {
          ballWorld.copy(world);
        }
      }

      // Rebuild the trail from the ball's real positions in the preceding frames.
      if (ballVisual) {
        let count = 0;
        for (let i = TRAIL_FRAMES - 1; i >= 0; i -= 1) {
          const point = ballVisual.frames.get(rounded - i);
          if (point === undefined) {
            continue;
          }
          const world = toWorld(point);
          trailPositions[count * 3] = world.x;
          trailPositions[count * 3 + 1] = 0.12;
          trailPositions[count * 3 + 2] = world.z;
          count += 1;
        }
        trailGeometry.setDrawRange(0, count);
        trailGeometry.attributes.position.needsUpdate = true;
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

      if (rotatingRef.current && !reducedMotionRef.current) {
        angle += delta * 0.35;
      }

      placeMarkers(frameRef.current);

      // Follow eases the camera target toward the ball; an auto motion, so it is
      // suppressed under reduced motion.
      if (followingRef.current && !reducedMotionRef.current) {
        lookTarget.lerp(ballWorld, 0.08);
      } else {
        lookTarget.lerp(new THREE.Vector3(0, 0, 0), 0.08);
      }
      applyCamera();

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
        window.localStorage.setItem(storageKey, String(Math.floor(frameRef.current)));
      } catch {
        // ignore
      }
      renderer.domElement.remove();
      renderer.dispose();
      grassTexture?.dispose();
      trailGeometry.dispose();
      (trail.material as THREE.Material).dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      markings.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      for (const item of disposables) {
        item.dispose();
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

  const toggleRotate = () => {
    const next = !rotatingRef.current;
    rotatingRef.current = next;
    setRotating(next);
  };

  const toggleFollow = () => {
    const next = !followingRef.current;
    followingRef.current = next;
    setFollowing(next);
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
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
            Our stylized tracking
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
            Frame <span className="v md-ltr">{frame} / {data.frameCount - 1}</span>
          </span>
        </div>
      </div>

      <div className="md-replay-controls">
        <button type="button" className="md-btn md-btn--primary md-btn--sm" onClick={togglePlay}>
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
        <button type="button" className="md-btn md-btn--secondary md-btn--sm" onClick={cycleSpeed} aria-label={`Playback speed ${speed} times`}>
          <span className="md-ltr">{speed}x</span>
        </button>
        <button type="button" className={`md-btn md-btn--${rotating ? "primary" : "secondary"} md-btn--sm`} onClick={toggleRotate} aria-pressed={rotating}>
          Rotate
        </button>
        <button type="button" className={`md-btn md-btn--${following ? "primary" : "secondary"} md-btn--sm`} onClick={toggleFollow} aria-pressed={following}>
          Follow
        </button>
        <button type="button" className="md-btn md-btn--secondary md-btn--sm" onClick={toggleFullscreen}>
          Fullscreen
        </button>
        <button type="button" className="md-btn md-btn--ghost md-btn--sm" onClick={() => setShowWork((value) => !value)} aria-expanded={showWork}>
          {"✓"} {showWork ? "Hide the work" : "Show the work"}
        </button>
      </div>

      <div className="md-legend">
        <span>
          <span className="md-legend-dot" style={{ background: BALL_COLOR }} /> ball with trail ({balls})
        </span>
        <span>
          <span className="md-legend-dot" style={{ background: PLAYER_COLOR }} /> stylized figures ({players})
        </span>
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
        Stylized broadcast view of our own tracking, not scanned player likenesses. The figures are illustrative, and positions are image space, normalized to the {data.clip.width ?? "?"} by {data.clip.height ?? "?"} video frame, not calibrated pitch coordinates, so the pitch is an illustrative stage. This clip is {data.clip.calibrated ? "calibrated" : "not calibrated"}.
      </p>
      <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: "var(--space-2)" }}>
        Source clip: {data.clip.clipName}
        {data.clip.author ? `, ${data.clip.author}` : ""}
        {data.clip.license ? `, ${data.clip.license}` : ""}
        {data.clip.licenseUrl ? (
          <>
            {" "}(
            <a href={data.clip.licenseUrl} style={{ color: "var(--md-text-mid)" }}>license</a>
            )
          </>
        ) : null}
        . Tracking is our own, source {data.clip.source}.
      </p>
    </section>
  );
}

function buildPlayer(disposables: { dispose: () => void }[]): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PLAYER_COLOR),
    roughness: 0.6,
    metalness: 0.05,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 6, 12), material);
  body.position.y = 0.42;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), material);
  head.position.y = 0.82;
  head.castShadow = true;
  group.add(body, head);
  disposables.push(body.geometry, head.geometry, material);
  return group;
}

function buildBall(disposables: { dispose: () => void }[]): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(BALL_COLOR),
    emissive: new THREE.Color(BALL_COLOR),
    emissiveIntensity: 0.6,
    roughness: 0.35,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), material);
  ball.position.y = 0.14;
  ball.castShadow = true;
  group.add(ball);
  disposables.push(ball.geometry, material);
  return group;
}

// Illustrative pitch markings as thin white lines just above the grass.
function buildMarkings(planeWidth: number, planeDepth: number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.32,
  });
  const hw = planeWidth / 2;
  const hd = planeDepth / 2;
  const y = 0.02;

  const addLine = (pts: THREE.Vector3[]) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(geometry, material));
  };

  addLine([
    new THREE.Vector3(-hw, y, -hd),
    new THREE.Vector3(hw, y, -hd),
    new THREE.Vector3(hw, y, hd),
    new THREE.Vector3(-hw, y, hd),
    new THREE.Vector3(-hw, y, -hd),
  ]);
  addLine([new THREE.Vector3(0, y, -hd), new THREE.Vector3(0, y, hd)]);

  const circle: THREE.Vector3[] = [];
  const r = planeDepth * 0.16;
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    circle.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  addLine(circle);

  const boxW = planeWidth * 0.14;
  const boxD = planeDepth * 0.5;
  addLine([
    new THREE.Vector3(-hw, y, -boxD / 2),
    new THREE.Vector3(-hw + boxW, y, -boxD / 2),
    new THREE.Vector3(-hw + boxW, y, boxD / 2),
    new THREE.Vector3(-hw, y, boxD / 2),
  ]);
  addLine([
    new THREE.Vector3(hw, y, -boxD / 2),
    new THREE.Vector3(hw - boxW, y, -boxD / 2),
    new THREE.Vector3(hw - boxW, y, boxD / 2),
    new THREE.Vector3(hw, y, boxD / 2),
  ]);

  return group;
}

// A mown stripe grass texture drawn into a canvas.
function makeGrassTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") {
    return null;
  }
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return null;
  }
  const stripes = 8;
  for (let i = 0; i < stripes; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#2f7a43" : "#2a6e3c";
    ctx.fillRect(0, (i * size) / stripes, size, size / stripes);
  }
  return new THREE.CanvasTexture(canvas);
}
