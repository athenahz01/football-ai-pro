import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveEntities } from "@/lib/insights/entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read only endpoint that resolves answer entity names to their profile, so the
// answer screen can turn names into tappable chips. It runs the fixed read only
// resolve query, never model SQL, and never writes.

const schema = z.object({
  names: z.array(z.string().trim().min(1).max(128)).max(50),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ entities: [] });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ entities: [] });
  }

  const entities = await resolveEntities(parsed.data.names);
  return NextResponse.json({ entities });
}
