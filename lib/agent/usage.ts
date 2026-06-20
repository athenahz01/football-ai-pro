import { config } from "@/lib/config/env";

// Token usage and cost accounting for the grounded pipeline. Every Claude call
// reports how many tokens it used. We normalize that into a single shape, sum it
// across the calls in one answer, and price it from the configured model rates so
// the eval can measure cost per query against the gate. Cache reads and cache
// writes are tracked separately because they are priced differently.

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

type GenerateTextLike = {
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedInputTokens?: number | null;
  };
  providerMetadata?: {
    anthropic?: {
      cacheCreationInputTokens?: number | null;
      cacheReadInputTokens?: number | null;
    };
  };
};

export function extractUsage(result: GenerateTextLike): TokenUsage {
  const usage = result.usage ?? {};
  const anthropic = result.providerMetadata?.anthropic ?? {};

  const cacheReadTokens = toCount(
    anthropic.cacheReadInputTokens ?? usage.cachedInputTokens,
  );
  const cacheWriteTokens = toCount(anthropic.cacheCreationInputTokens);

  return {
    inputTokens: toCount(usage.inputTokens),
    outputTokens: toCount(usage.outputTokens),
    cacheReadTokens,
    cacheWriteTokens,
  };
}

export function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}

export function totalTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheReadTokens +
    usage.cacheWriteTokens
  );
}

export function computeCostUsd(usage: TokenUsage): number {
  const pricing = config.modelPricing;

  return (
    usage.inputTokens * pricing.inputPerToken +
    usage.outputTokens * pricing.outputPerToken +
    usage.cacheReadTokens * pricing.cacheReadPerToken +
    usage.cacheWriteTokens * pricing.cacheWritePerToken
  );
}

function toCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round(value);
}
