import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  followEntity,
  listFollows,
  unfollowEntity,
  type ServiceResult,
} from "@/lib/follows/service";

export const runtime = "nodejs";

// Follows endpoints. They require a signed in user. The user id is always taken
// from the server session inside the service, never from the request body, so a
// user can only ever see and change their own follows. These are cheap database
// operations with no model call.

const targetSchema = z.object({
  type: z.enum(["team", "player"]),
  id: z.string().trim().min(1).max(128),
});

export async function GET() {
  return respond(await listFollows());
}

export async function POST(request: NextRequest) {
  const target = await readTarget(request);
  if (target === null) {
    return invalidTarget();
  }

  return respond(await followEntity(target));
}

export async function DELETE(request: NextRequest) {
  const target = await readTarget(request);
  if (target === null) {
    return invalidTarget();
  }

  return respond(await unfollowEntity(target));
}

async function readTarget(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }

  const parsed = targetSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function respond<T>(result: ServiceResult<T>): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}

function invalidTarget(): NextResponse {
  return NextResponse.json(
    { error: "Provide a type of team or player and a valid id." },
    { status: 400 },
  );
}
