import Link from "next/link";

import { listReplayClips } from "@/lib/replay/queries";
import { ReplayViewer } from "./replay-viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The replay page. It lists the processed clips that have stored positions and
// renders a 3D replay of one of them. The positions are real, from our own tracking
// of a rights confirmed clip, read through the fixed read only query path. They are
// image space normalized to the video frame, not a real pitch in meters, and the
// page says so. A calibrated, rights confirmed match clip would make this a real
// pitch replay with no change to the viewer.

export default async function ReplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = readParam(params.clip);

  const clips = await listReplayClips();
  const selected =
    clips.find((clip) => clip.clipId === requested) ?? clips[0] ?? null;

  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <Link href="/ask" style={styles.navLink}>
          Ask
        </Link>
        <Link href="/compare" style={styles.navLink}>
          Compare
        </Link>
        <Link href="/scout" style={styles.navLink}>
          Scout
        </Link>
      </nav>

      <h1 style={styles.title}>Replay</h1>
      <p style={styles.subtitle}>
        A 3D replay of our own computer vision tracking on an openly licensed clip.
        The markers move along the real stored positions, read straight from the
        database. The positions are image space, normalized to the video frame, not a
        real pitch in meters. A calibrated, rights confirmed match clip would turn
        this into a real pitch replay with no change to the viewer.
      </p>

      {selected === null ? (
        <p style={styles.note}>
          No processed clip has stored positions yet, so there is nothing to replay.
        </p>
      ) : (
        <>
          {clips.length > 1 ? (
            <form method="get" style={styles.form}>
              <label style={styles.label}>
                Clip
                <select
                  name="clip"
                  defaultValue={selected.clipId}
                  style={styles.select}
                >
                  {clips.map((clip) => (
                    <option key={clip.clipId} value={clip.clipId}>
                      {clip.clipName}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" style={styles.button}>
                Load
              </button>
            </form>
          ) : null}

          <ReplayViewer clipId={selected.clipId} />
        </>
      )}
    </main>
  );
}

function readParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "32px 24px 48px",
    fontFamily: "system-ui, sans-serif",
    color: "#111",
  },
  nav: { display: "flex", gap: "16px", marginBottom: "16px", fontSize: "14px" },
  navLink: { color: "#333" },
  title: { fontSize: "28px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { color: "#555", marginBottom: "20px", lineHeight: 1.5 },
  form: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
    marginBottom: "16px",
    flexWrap: "wrap",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "13px",
    color: "#555",
  },
  select: {
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "#fff",
  },
  button: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#111",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  note: { fontSize: "14px", color: "#b00020" },
};
