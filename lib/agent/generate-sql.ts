import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type SystemModelMessage } from "ai";

import { config } from "@/lib/config/env";
import { formatGlossaryHits, type GlossaryHit } from "@/lib/retrieval/glossary";
import { getSchemaContext } from "@/lib/retrieval/schema-context";

export type GenerateSqlInput = {
  question: string;
  glossaryHits: GlossaryHit[];
  previousSql?: string;
  rejectionReason?: string;
};

export type GeneratedSql = {
  sql: string;
};

const anthropic = createAnthropic({
  apiKey: config.anthropicApiKey,
});

export async function generateSql(
  input: GenerateSqlInput,
): Promise<GeneratedSql> {
  const schemaContext = await getSchemaContext();
  const systemMessage = buildCachedSystemMessage(schemaContext);
  const prompt = buildUserPrompt(input);
  const { text } = await generateText({
    model: anthropic(config.anthropicModel),
    system: systemMessage,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
    maxOutputTokens: 512,
  });

  return {
    sql: extractSql(text),
  };
}

function buildCachedSystemMessage(schemaContext: string): SystemModelMessage {
  return {
    role: "system",
    content: `${STATIC_SQL_INSTRUCTIONS}\n\nSchema context:\n${schemaContext}`,
    providerOptions: {
      anthropic: {
        cacheControl: { type: "ephemeral" },
      },
    },
  };
}

function buildUserPrompt(input: GenerateSqlInput): string {
  const repairBlock =
    input.previousSql !== undefined && input.rejectionReason !== undefined
      ? [
          "The previous SQL was rejected by the guard.",
          `Rejected SQL:\n${input.previousSql}`,
          `Rejection reason:\n${input.rejectionReason}`,
          "Return a corrected single read only SQL query.",
        ].join("\n\n")
      : "";

  return [
    `Question:\n${input.question}`,
    `Retrieved glossary context:\n${formatGlossaryHits(input.glossaryHits)}`,
    repairBlock,
    "Return only the SQL query. Do not use markdown fences. Do not explain the query.",
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function extractSql(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const sql = fenced?.[1] ?? trimmed;

  return sql.trim();
}

const STATIC_SQL_INSTRUCTIONS = [
  "You write one read only Postgres SELECT query for a football analytics database.",
  "Return SQL only.",
  "Never include prose, markdown, comments, or answer numbers.",
  "Use only tables and columns present in the schema context.",
  "Never invent data.",
  "Never query row data just to discover labels. Use the glossary exact values.",
  "Match stored label values exactly, including capitalization.",
  "For event labels, match match_events.type using values such as Shot or Pass.",
  "For SPADL labels, match spadl_actions.spadl_type using lowercase values such as shot or pass.",
  "Prefer action_values.xt_value for expected threat.",
  "Prefer action_values.vaep_value, vaep_offensive, and vaep_defensive for VAEP.",
  "Prefer shot_xg.xg for expected goals.",
  "The query must be a single SELECT or WITH query whose final statement is SELECT.",
  "Never use INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP, ALTER, CREATE, GRANT, REVOKE, COPY, CALL, SELECT INTO, or row locking.",
].join("\n");
