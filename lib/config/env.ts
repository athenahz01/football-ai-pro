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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  return !/^(false|0|no|off)$/i.test(value.trim());
}

const PER_MILLION = 1_000_000;

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
  DATA_PROVIDER: z.enum(["statsbomb_open", "api_football"]),
  ETL_COMPETITION_IDS: z.string().optional().transform(parseCsvList),
  SEMANTIC_CACHE_ENABLED: z.string().optional(),
  SEMANTIC_CACHE_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.97),
  SEMANTIC_CACHE_MAX_AGE_SECONDS: z.coerce.number().min(0).default(0),
  RATE_LIMIT_ENABLED: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(12),
  RATE_LIMIT_PER_DAY: z.coerce.number().int().positive().default(300),
  ANTHROPIC_INPUT_USD_PER_MTOK: z.coerce.number().min(0).default(1.0),
  ANTHROPIC_OUTPUT_USD_PER_MTOK: z.coerce.number().min(0).default(5.0),
  ANTHROPIC_CACHE_READ_USD_PER_MTOK: z.coerce.number().min(0).default(0.1),
  ANTHROPIC_CACHE_WRITE_USD_PER_MTOK: z.coerce.number().min(0).default(1.25),
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
  semanticCacheEnabled: parseBoolean(parsedEnv.data.SEMANTIC_CACHE_ENABLED, true),
  semanticCacheSimilarityThreshold:
    parsedEnv.data.SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
  semanticCacheMaxAgeSeconds: parsedEnv.data.SEMANTIC_CACHE_MAX_AGE_SECONDS,
  rateLimitEnabled: parseBoolean(parsedEnv.data.RATE_LIMIT_ENABLED, true),
  rateLimitPerMinute: parsedEnv.data.RATE_LIMIT_PER_MINUTE,
  rateLimitPerDay: parsedEnv.data.RATE_LIMIT_PER_DAY,
  // Per-token prices for the configured model, derived from the per-million
  // dollar prices. Cache reads are far cheaper than fresh input, cache writes a
  // little more expensive. Defaults match Claude Haiku 4.5.
  modelPricing: {
    inputPerToken: parsedEnv.data.ANTHROPIC_INPUT_USD_PER_MTOK / PER_MILLION,
    outputPerToken: parsedEnv.data.ANTHROPIC_OUTPUT_USD_PER_MTOK / PER_MILLION,
    cacheReadPerToken:
      parsedEnv.data.ANTHROPIC_CACHE_READ_USD_PER_MTOK / PER_MILLION,
    cacheWritePerToken:
      parsedEnv.data.ANTHROPIC_CACHE_WRITE_USD_PER_MTOK / PER_MILLION,
  },
} as const;

export type AppConfig = typeof config;
