import { listGoalReplays, listReplayClips } from "@/lib/replay/queries";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";
import { ShareToCommunity } from "@/app/community/share-to-community";
import { GoalReplayViewer } from "./goal-replay-viewer";
import { ReplayViewer } from "./replay-viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The replay screen, restyled onto MATCHDAY. The headline replay is a real World
// Cup goal reconstructed from stored event coordinates and xT values. The computer
// vision tracking clip remains as a secondary demo, clearly labelled as image
// space tracking from our own processed clip.

export default async function ReplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedGoal = readParam(params.goal);
  const requested = readParam(params.clip);

  const [goals, clips] = await Promise.all([
    listGoalReplays(),
    listReplayClips(),
  ]);
  const selectedGoal =
    goals.find((goal) => goal.goalId === requestedGoal) ?? goals[0] ?? null;
  const selected =
    clips.find((clip) => clip.clipId === requested) ?? clips[0] ?? null;
  const signedIn = (await getAuthenticatedUser()) !== null;

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "860px" }}>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          The wow moment
        </span>
        <h1
          className="md-display-3"
          style={{ margin: "var(--space-2) 0 var(--space-3)" }}
        >
          Goal Replay
        </h1>
        <p
          className="md-body"
          style={{
            color: "var(--md-text-mid)",
            marginBottom: "var(--space-5)",
          }}
        >
          A real World Cup goal, reconstructed from stored event rows on a
          stylized pitch. The trail uses real coordinates, the scorer and minute
          come from the goal event, and the XT chip is summed from action_values
          over the scoring possession.
        </p>

        {selectedGoal === null ? (
          <p className="md-small" style={{ color: "var(--md-amber)" }}>
            This database has no World Cup goals with stored event coordinates,
            so no rich goal replay is available.
          </p>
        ) : (
          <>
            {goals.length > 1 ? (
              <form method="get" className="md-replay-picker">
                <label className="md-field" style={{ flex: "1 1 280px" }}>
                  Goal
                  <select
                    name="goal"
                    defaultValue={selectedGoal.goalId}
                    className="md-select"
                    style={{ height: "44px" }}
                  >
                    {goals.map((goal) => (
                      <option key={goal.goalId} value={goal.goalId}>
                        {goalOption(goal)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="md-btn md-btn--secondary md-btn--md"
                >
                  Load
                </button>
              </form>
            ) : null}

            <GoalReplayViewer goalId={selectedGoal.goalId} />
          </>
        )}

        <section style={{ marginTop: "var(--space-8)" }}>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
            Our computer vision demo
          </span>
          <h2
            className="md-display-3"
            style={{
              fontSize: "20px",
              margin: "var(--space-2) 0 var(--space-3)",
            }}
          >
            Image Space Tracking
          </h2>
          <p
            className="md-body"
            style={{
              color: "var(--md-text-mid)",
              marginBottom: "var(--space-4)",
            }}
          >
            The original CV clip stays here as a smaller demo. It is our own
            broadcast_cv tracking on an openly licensed clip, normalized to
            image space, not a calibrated pitch replay.
          </p>

          {selected === null ? (
            <p className="md-small" style={{ color: "var(--md-amber)" }}>
              No processed clip has stored positions yet, so there is nothing to
              replay.
            </p>
          ) : (
            <>
              {clips.length > 1 ? (
                <form method="get" className="md-replay-picker">
                  {selectedGoal ? (
                    <input
                      type="hidden"
                      name="goal"
                      value={selectedGoal.goalId}
                    />
                  ) : null}
                  <label className="md-field" style={{ flex: "1 1 260px" }}>
                    Clip
                    <select
                      name="clip"
                      defaultValue={selected.clipId}
                      className="md-select"
                      style={{ height: "44px" }}
                    >
                      {clips.map((clip) => (
                        <option key={clip.clipId} value={clip.clipId}>
                          {clip.clipName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="md-btn md-btn--secondary md-btn--md"
                  >
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
        </section>
      </div>
    </main>
  );
}

function readParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function goalOption(goal: {
  scorer: string;
  minute: number;
  homeTeamName: string;
  awayTeamName: string;
  stage: string | null;
  shotType: string | null;
}): string {
  const stage = goal.stage ? `${goal.stage}, ` : "";
  const shotType = goal.shotType === "penalty" ? ", penalty" : "";
  return `${goal.scorer}, ${goal.minute + 1}'${shotType}, ${stage}${goal.homeTeamName} v ${goal.awayTeamName}`;
}
