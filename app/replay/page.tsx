import { listReplayClips } from "@/lib/replay/queries";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";
import { ShareToCommunity } from "@/app/community/share-to-community";
import { ReplayViewer } from "./replay-viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The replay screen, restyled onto MATCHDAY. The data still comes from the read only
// replay query layer; only the chrome changes. The positions are image space,
// normalized to the video frame, not a real pitch in meters, and the viewer says so.
// A calibrated, rights confirmed match clip would make this a real pitch replay with
// no change to the viewer.

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
  const signedIn = (await getAuthenticatedUser()) !== null;

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "860px" }}>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          The wow moment
        </span>
        <h1 className="md-display-3" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
          3D Replay
        </h1>
        <p
          className="md-body"
          style={{ color: "var(--md-text-mid)", marginBottom: "var(--space-5)" }}
        >
          A 3D replay of our own computer vision tracking on an openly licensed clip.
          The markers move along the real stored positions, read straight from the
          database. The positions are image space, normalized to the video frame, not
          a real pitch in meters. A calibrated, rights confirmed match clip would turn
          this into a real pitch replay with no change to the viewer.
        </p>

        {selected === null ? (
          <p className="md-small" style={{ color: "var(--md-amber)" }}>
            No processed clip has stored positions yet, so there is nothing to replay.
          </p>
        ) : (
          <>
            {clips.length > 1 ? (
              <form method="get" style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
                <label className="md-field" style={{ flex: "0 0 auto" }}>
                  Clip
                  <select name="clip" defaultValue={selected.clipId} className="md-select" style={{ height: "44px" }}>
                    {clips.map((clip) => (
                      <option key={clip.clipId} value={clip.clipId}>
                        {clip.clipName}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="md-btn md-btn--secondary md-btn--md">
                  Load
                </button>
              </form>
            ) : null}

            <ReplayViewer clipId={selected.clipId} />

            <ShareToCommunity
              kind="replay"
              params={{ clip: selected.clipId }}
              signedIn={signedIn}
            />
          </>
        )}
      </div>
    </main>
  );
}

function readParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
