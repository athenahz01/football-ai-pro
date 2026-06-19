import "server-only";

import { explainAnswer } from "@/lib/agent/explain-answer";
import { generateSql } from "@/lib/agent/generate-sql";
import {
  verifyGrounding,
  type GroundingVerification,
} from "@/lib/agent/verify-grounding";
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
};

export type GroundedQueryError = {
  ok: false;
  message: string;
  generatedSql?: string;
  glossary: GlossaryHit[];
};

export type GroundedQueryResult = GroundedQuerySuccess | GroundedQueryError;

export type ExplainedAnswerSuccess = GroundedQuerySuccess & {
  answer: string;
  grounding: GroundingVerification;
};

export type ExplainedAnswerError = GroundedQueryError & {
  answer: string;
  columns: string[];
  rows: [];
  grounding: GroundingVerification;
};

export type ExplainedAnswerResult =
  | ExplainedAnswerSuccess
  | ExplainedAnswerError;

export async function answerQuery(
  question: string,
): Promise<GroundedQueryResult> {
  const glossary = await retrieveGlossary(question);
  const firstSql = (await generateSql({ question, glossaryHits: glossary }))
    .sql;
  const firstGuard = guardSql(firstSql);

  if (firstGuard.ok) {
    return executeGuardedQuestion(firstSql, glossary);
  }

  const repairedSql = (
    await generateSql({
      question,
      glossaryHits: glossary,
      previousSql: firstSql,
      rejectionReason: firstGuard.reason,
    })
  ).sql;
  const repairedGuard = guardSql(repairedSql);

  if (!repairedGuard.ok) {
    return {
      ok: false,
      message: repairedGuard.reason,
      generatedSql: repairedSql,
      glossary,
    };
  }

  return executeGuardedQuestion(repairedSql, glossary);
}

export async function answerQuestionWithExplanation(
  question: string,
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
    };
  }

  const answer = await explainAnswer({
    question,
    executedSql: queryResult.executedSql,
    columns: queryResult.columns,
    rows: queryResult.rows,
  });
  const grounding = verifyGrounding(answer, queryResult.rows, question);

  return {
    ...queryResult,
    answer,
    grounding,
  };
}

async function executeGuardedQuestion(
  sql: string,
  glossary: GlossaryHit[],
): Promise<GroundedQueryResult> {
  const result = await executeReadOnlySql(sql);

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      generatedSql: sql,
      glossary,
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
  };
}
