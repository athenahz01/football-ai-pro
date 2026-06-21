import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  deletePost,
  publishInputSchema,
  publishPost,
  type ServiceResult,
} from "@/lib/community/service";

export const runtime = "nodejs";

// Community endpoints. Publishing and deleting both require a signed in user. The
// author id is always taken from the server session inside the service, never from
// the request body, so a user can only publish as themselves and only delete their
// own posts. The feed itself is read and rendered by the server components, which
// re run the fixed read only queries. No model written SQL runs here.

const deleteSchema = z.object({ id: z.string().trim().min(1).max(128) });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = publishInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a kind, its parameters, and an optional caption." },
      { status: 400 },
    );
  }

  return respond(await publishPost(parsed.data));
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a post id." }, { status: 400 });
  }

  return respond(await deletePost(parsed.data.id));
}

function respond<T>(result: ServiceResult<T>): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
