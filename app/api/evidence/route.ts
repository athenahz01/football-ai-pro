import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCitedEvents } from "@/lib/insights/pitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read only endpoint for the evidence panel. It returns the real cited events behind
// an answer, a player or team's shots or passes with coordinates, minutes, teams, and
// outcomes, from the fixed read only query. Never model SQL, never the write path. The
// list is the real evidence, not a re-summary, and it is empty for a feed that carries
// no event coordinates, where the UI falls back honestly.

const schema = z.object({
  kind: z.enum(["player", "team"]),
  id: z.string().trim().min(1).max(128),
  type: z.enum(["Shot", "Pass"]),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ events: [] });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ events: [] });
  }

  const events = await getCitedEvents(parsed.data.kind, parsed.data.id, parsed.data.type);
  return NextResponse.json({ events });
}
