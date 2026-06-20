import "server-only";

import { explainAnswer } from "@/lib/agent/explain-answer";
import { generateSql } from "@/lib/agent/generate-sql";
import {
  addUsage,
  computeCostUsd,
  ZERO_USAGE,
  type TokenUsage,
} from "@/lib/agent/usage";
import {
  verifyGrounding,
  type GroundingVerification,
} from "@/lib/agent/verify-grounding";
import {
  embedQuestion,
  lookupCachedAnswer,
  storeCachedAnswer,
  type CachedAnswer,
} from "@/lib/cache/query-cache";
import { config } from "@/lib/config/env";
import {
  DEFAULT_LANGUAGE,
  languageName,
  type LanguageCode,
} from "@/lib/i18n/languages";
import { retrieveGlossary, type GlossaryHit } from "@/lib/retrieval/glossary";
import { executeReadOnlySql } from "@/lib/sql/executor";
import { guardSql } from "@/lib/sql/guard";
import type { SqlExecutionSuccess } from "@/lib/sql/types";

export type GroundedQuerySuccess = {
  ok: true;
  generatedSql: string;
  executedSql: string;
  columns: string[];
  rows: SqlExecutionSuccess["rows"];
  rowCount: number;
  truncated: boolean;
  glossary: GlossaryHit[];
  usage: TokenUsage;
};

export type GroundedQueryError = {
  ok: false;
  message: string;
  generatedSql?: string;
  glossary: GlossaryHit[];
  usage: TokenUsage;
};

export type GroundedQueryResult = GroundedQuerySuccess | GroundedQueryError;

export type ExplainedAnswerSuccess = GroundedQuerySuccess & {
  answer: string;
  grounding: GroundingVerification;
  usage: TokenUsage;
  costUsd: number;
  servedFromCache: boolean;
};

export type ExplainedAnswerError = GroundedQueryError & {
  answer: string;
  columns: string[];
  rows: [];
  grounding: GroundingVerification;
  usage: TokenUsage;
  costUsd: number;
  servedFromCache: boolean;
};

export type ExplainedAnswerResult =
  | ExplainedAnswerSuccess
  | ExplainedAnswerError;

export type AnswerOptions = {
  useCache?: boolean;
  language?: LanguageCode;
};

export async function answerQuery(
  question: string,
): Promise<GroundedQueryResult> {
  const glossary = await retrieveGlossary(question);
  const first = await generateSql({ question, glossaryHits: glossary });
  let usage = first.usage;
  const firstGuard = guardSql(first.sql);

  if (firstGuard.ok) {
    return executeGuardedQuestion(first.sql, glossary, usage);
  }

  const repaired = await generateSql({
    question,
    glossaryHits: glossary,
    previousSql: first.sql,
    rejectionReason: firstGuard.reason,
  });
  usage = addUsage(usage, repaired.usage);
  const repairedGuard = guardSql(repaired.sql);

  if (!repairedGuard.ok) {
    return {
      ok: false,
      message: repairedGuard.reason,
      generatedSql: repaired.sql,
      glossary,
      usage,
    };
  }

  return executeGuardedQuestion(repaired.sql, glossary, usage);
}

export async function answerQuestionWithExplanation(
  question: string,
  options: AnswerOptions = {},
): Promise<ExplainedAnswerResult> {
  const useCache = options.useCache ?? config.semanticCacheEnabled;
  const language = options.language ?? DEFAULT_LANGUAGE;
  const embedding = useCache ? await embedQuestion(question) : null;

  if (embedding !== null) {
    const cached = await lookupCachedAnswer(
      embedding,
      config.semanticCacheSimilarityThreshold,
      config.semanticCacheMaxAgeSeconds,
      language,
    );

    if (cached !== null) {
      return fromCachedAnswer(cached);
    }
  }

  const result = await computeExplainedAnswer(question, language);

  if (embedding !== null && result.ok) {
    await storeCachedAnswer(question, embedding, toCachedAnswer(result), language);
  }

  return result;
}

async function computeExplainedAnswer(
  question: string,
  language: LanguageCode,
): Promise<ExplainedAnswerResult> {
  const queryResult = await answerQuery(question);

  if (!queryResult.ok) {
    return {
      ...queryResult,
      answer: `I could not answer this from the database. ${queryResult.message}`,
      columns: [],
      rows: [],
      grounding: {
        grounded: true,
        ungroundedNumbers: [],
      },
      usage: queryResult.usage,
      costUsd: computeCostUsd(queryResult.usage),
      servedFromCache: false,
    };
  }

  const explanation = await explainAnswer({
    question,
    executedSql: queryResult.executedSql,
    columns: queryResult.columns,
    rows: queryResult.rows,
    language: languageName(language),
  });
  const usage = addUsage(queryResult.usage, explanation.usage);
  const grounding = verifyGrounding(explanation.answer, queryResult.rows, question);

  return {
    ...queryResult,
    answer: explanation.answer,
    grounding,
    usage,
    costUsd: computeCostUsd(usage),
    servedFromCache: false,
  };
}

async function executeGuardedQuestion(
  sql: string,
  glossary: GlossaryHit[],
  usage: TokenUsage,
): Promise<GroundedQueryResult> {
  const result = await executeReadOnlySql(sql);

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      generatedSql: sql,
      glossary,
      usage,
    };
  }

  return {
    ok: true,
    generatedSql: sql,
    executedSql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    truncated: result.truncated,
    glossary,
    usage,
  };
}

function toCachedAnswer(result: ExplainedAnswerSuccess): CachedAnswer {
  return {
    answer: result.answer,
    generatedSql: result.generatedSql,
    executedSql: result.executedSql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    truncated: result.truncated,
    grounded: result.grounding.grounded,
    ungroundedNumbers: result.grounding.ungroundedNumbers,
    glossary: result.glossary,
    model: config.anthropicModel,
  };
}

function fromCachedAnswer(cached: CachedAnswer): ExplainedAnswerSuccess {
  return {
    ok: true,
    generatedSql: cached.generatedSql,
    executedSql: cached.executedSql,
    columns: cached.columns,
    rows: cached.rows,
    rowCount: cached.rowCount,
    truncated: cached.truncated,
    glossary: cached.glossary,
    answer: cached.answer,
    grounding: {
      grounded: cached.grounded,
      ungroundedNumbers: cached.ungroundedNumbers,
    },
    usage: ZERO_USAGE,
    costUsd: 0,
    servedFromCache: true,
  };
}
