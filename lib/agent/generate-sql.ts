import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type SystemModelMessage } from "ai";

import { extractUsage, type TokenUsage } from "@/lib/agent/usage";
import { config } from "@/lib/config/env";
import { getDatasetReference } from "@/lib/retrieval/dataset-reference";
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
  usage: TokenUsage;
};

const anthropic = createAnthropic({
  apiKey: config.anthropicApiKey,
});

export async function generateSql(
  input: GenerateSqlInput,
): Promise<GeneratedSql> {
  const [schemaContext, datasetReference] = await Promise.all([
    getSchemaContext(),
    getDatasetReference(),
  ]);
  const systemMessage = buildCachedSystemMessage(
    schemaContext,
    datasetReference,
  );
  const prompt = buildUserPrompt(input);
  const result = await generateText({
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
    sql: extractSql(result.text),
    usage: extractUsage(result),
  };
}

function buildCachedSystemMessage(
  schemaContext: string,
  datasetReference: string,
): SystemModelMessage {
  return {
    role: "system",
    content: `${STATIC_SQL_INSTRUCTIONS}\n\nSchema context:\n${schemaContext}\n\nDataset reference:\n${datasetReference}`,
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
  "Never query row data just to discover labels. Use exact values from the dataset reference and glossary.",
  "Match stored label values exactly, including capitalization.",
  "Scope competition filters using competitions.name and competitions.season_name with exact values from the dataset reference.",
  "Match team and competition names exactly as listed in the dataset reference.",
  "For event labels, match match_events.type using values such as Shot or Pass.",
  "For SPADL labels, match spadl_actions.spadl_type using lowercase values such as shot or pass.",
  "For competition-scoped action value queries, first filter matches in a CTE, then join spadl_actions and action_values.",
  "Prefer action_values.xt_value for expected threat.",
  "Prefer action_values.vaep_value, vaep_offensive, and vaep_defensive for VAEP.",
  "Prefer shot_xg.xg for expected goals.",
  "For win, draw, or loss probabilities, read the stored values in match_predictions. Never compute or invent a probability. Use prob_home_win when the asked team is the home team and prob_away_win when it is the away team, and prob_draw for a draw. Filter by home_team_name and away_team_name, or join home_team_id and away_team_id to teams.",
  "For team strength, Elo rating, or attack and defense strength, read team_ratings and join team_ratings.team_id to teams.team_id for the name.",
  "To filter shots by an event attribute such as shot_type, body_part, or play_pattern while using shot_xg, join shot_xg.action_id to spadl_actions.action_id, then spadl_actions.source_event_id to match_events.event_id. Never join shot_xg to match_events on match_id, which multiplies rows.",
  "When combining home and away rows with UNION ALL to compute a per team total, aggregate the combined rows in an outer query with SUM and GROUP BY the team. Do not select an inner aggregate alias without re aggregating it.",
  "The query must be a single SELECT or WITH query whose final statement is SELECT.",
  "Never use INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP, ALTER, CREATE, GRANT, REVOKE, COPY, CALL, SELECT INTO, or row locking.",
].join("\n");
