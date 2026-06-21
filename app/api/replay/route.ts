import { NextRequest, NextResponse } from "next/server";

import { getReplayData, listReplayClips } from "@/lib/replay/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read only endpoint for the 3D replay. With no clip it lists the processed clips
// that have stored positions. With a clip it serves that clip's tracks and their
// per frame points. Everything comes from the fixed parameterized read only query
// path in lib/replay/queries.ts. There is no model written SQL here and this
// endpoint never writes. Only positions already stored from our own tracking of a
// rights confirmed clip are returned, and they are image space normalized to the
// frame, not meters.

export async function GET(request: NextRequest) {
  const clipId = request.nextUrl.searchParams.get("clip");

  if (!clipId) {
    const clips = await listReplayClips();
    return NextResponse.json({ clips });
  }

  const data = await getReplayData(clipId);

  if (!data) {
    return NextResponse.json({ error: "No such clip." }, { status: 404 });
  }

  return NextResponse.json(data);
}
