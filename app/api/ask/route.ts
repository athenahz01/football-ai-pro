import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { answerQuestionWithExplanation } from "@/lib/agent/answer-query";
import { config } from "@/lib/config/env";
import {
  checkRateLimit,
  type RateLimitSubject,
} from "@/lib/rate-limit/limiter";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";

export const runtime = "nodejs";

const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
});

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  const parsed = askRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Question is required and must be 500 characters or less.",
      },
      { status: 400 },
    );
  }

  // Check the rate limit before any model call so abuse cannot run up cost. A
  // signed in user is limited per user id with a higher allowance; anonymous
  // traffic is limited per client IP.
  if (config.rateLimitEnabled) {
    const subject = await resolveSubject(request);
    const limit = await checkRateLimit(subject);

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `You have reached the ${limit.scope} request limit. Please wait about ${limit.retryAfterSeconds} seconds and try again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }
  }

  try {
    const result = await answerQuestionWithExplanation(parsed.data.question);

    if (!result.ok) {
      console.error(
        "ask route 422:",
        result.message,
        "| generatedSql:",
        result.generatedSql,
      );
      return NextResponse.json(
        {
          answer: result.answer,
          error: result.message,
          generatedSql: result.generatedSql,
          columns: result.columns,
          rows: result.rows,
          glossary: result.glossary,
          grounding: result.grounding,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      answer: result.answer,
      generatedSql: result.generatedSql,
      executedSql: result.executedSql,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated,
      glossary: result.glossary,
      grounding: result.grounding,
      servedFromCache: result.servedFromCache,
    });
  } catch (error) {
    console.error("ask route failed:", error);
    return NextResponse.json(
      {
        answer: "I could not answer this from the database.",
        error: "The grounded answer pipeline failed.",
      },
      { status: 500 },
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function resolveSubject(
  request: NextRequest,
): Promise<RateLimitSubject> {
  try {
    const user = await getAuthenticatedUser();
    if (user) {
      return { kind: "user", value: user.id };
    }
  } catch {
    // If auth is not configured or the lookup fails, fall back to the IP limit.
  }

  return { kind: "ip", value: clientIp(request) };
}

function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor !== null && forwardedFor.length > 0) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
