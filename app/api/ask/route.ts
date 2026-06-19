import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { answerQuestionWithExplanation } from "@/lib/agent/answer-query";

export const runtime = "nodejs";

const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
});

export async function POST(request: NextRequest) {
  // Phase 1: add per user and per IP rate limiting here before model calls.
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
