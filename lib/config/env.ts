import { z } from "zod";

import type { DataProviderId } from "@/lib/providers/types";

function parseCsvList(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ];
}

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
  DATA_PROVIDER: z.enum(["statsbomb_open", "api_football"]),
  ETL_COMPETITION_IDS: z.string().optional().transform(parseCsvList),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration. ${details}`);
}

export const config = {
  supabaseUrl: parsedEnv.data.SUPABASE_URL,
  supabaseAnonKey: parsedEnv.data.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: parsedEnv.data.SUPABASE_SERVICE_ROLE_KEY,
  supabaseDbUrl: parsedEnv.data.SUPABASE_DB_URL,
  anthropicApiKey: parsedEnv.data.ANTHROPIC_API_KEY,
  anthropicModel: parsedEnv.data.ANTHROPIC_MODEL,
  dataProvider: parsedEnv.data.DATA_PROVIDER satisfies DataProviderId,
  etlCompetitionIds: parsedEnv.data.ETL_COMPETITION_IDS,
} as const;

export type AppConfig = typeof config;
