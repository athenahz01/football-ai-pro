import { NextRequest, NextResponse } from "next/server";

import {
  getGoalReplayData,
  getReplayData,
  listGoalReplays,
  listReplayClips,
} from "@/lib/replay/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read only endpoint for replay data. With a goal id it serves a real World Cup
// scoring possession reconstructed from stored event coordinates. With a clip id
// it serves the secondary computer vision demo. With no parameter it lists both.
// Everything comes from fixed parameterized read only queries in lib/replay/queries.
// There is no model written SQL here and this endpoint never writes.

export async function GET(request: NextRequest) {
  const goalId = request.nextUrl.searchParams.get("goal");
  const clipId = request.nextUrl.searchParams.get("clip");

  if (goalId) {
    const data = await getGoalReplayData(goalId);

    if (!data) {
      return NextResponse.json({ error: "No such goal." }, { status: 404 });
    }

    return NextResponse.json(data);
  }

  if (!clipId) {
    const [goals, clips] = await Promise.all([
      listGoalReplays(),
      listReplayClips(),
    ]);
    return NextResponse.json({ goals, clips });
  }

  const data = await getReplayData(clipId);

  if (!data) {
    return NextResponse.json({ error: "No such clip." }, { status: 404 });
  }

  return NextResponse.json(data);
}
