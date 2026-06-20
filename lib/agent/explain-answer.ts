import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

import { extractUsage, type TokenUsage } from "@/lib/agent/usage";
import { config } from "@/lib/config/env";
import type { SqlValue } from "@/lib/sql/types";

export type ExplainAnswerInput = {
  question: string;
  executedSql: string;
  columns: string[];
  rows: Record<string, SqlValue>[];
};

export type ExplainedAnswer = {
  answer: string;
  usage: TokenUsage;
};

const MAX_ROWS_IN_EXPLANATION_PROMPT = 100;
const anthropic = createAnthropic({
  apiKey: config.anthropicApiKey,
});

export async function explainAnswer(
  input: ExplainAnswerInput,
): Promise<ExplainedAnswer> {
  const result = await generateText({
    model: anthropic(config.anthropicModel),
    system: EXPLANATION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildExplanationPrompt(input),
      },
    ],
    temperature: 0,
    maxOutputTokens: 400,
  });

  return {
    answer: cleanAnswerText(result.text),
    usage: extractUsage(result),
  };
}

function buildExplanationPrompt(input: ExplainAnswerInput): string {
  const shownRows = input.rows.slice(0, MAX_ROWS_IN_EXPLANATION_PROMPT);

  return [
    `Question: ${input.question}`,
    `Executed SQL:\n${input.executedSql}`,
    `Columns: ${input.columns.join(", ")}`,
    `Returned row count: ${input.rows.length}`,
    `Rows shown: ${shownRows.length}`,
    `Rows JSON:\n${JSON.stringify(shownRows)}`,
    "Write the answer now.",
  ].join("\n\n");
}

function cleanAnswerText(text: string): string {
  return text.trim().replaceAll("\u2014", ", ");
}

const EXPLANATION_SYSTEM_PROMPT = [
  "Explain database query results in clear human language.",
  "Use only the numbers and values present in the provided rows or row count.",
  "Never add statistics from outside the rows.",
  "Never infer or estimate missing values.",
  "Copy numeric result values exactly as provided. Do not round them.",
  "Do not repeat numbers from the question unless the same number appears in the rows or row count.",
  "If the result is empty, say plainly that the data has no answer for this question.",
  "Do not mention SQL unless it helps clarify the result.",
  "Do not use em dashes.",
  "Write like a knowledgeable person, with no filler and no breathless verdicts.",
].join("\n");
