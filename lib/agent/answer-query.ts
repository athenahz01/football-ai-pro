import "server-only";

import { generateSql } from "@/lib/agent/generate-sql";
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
