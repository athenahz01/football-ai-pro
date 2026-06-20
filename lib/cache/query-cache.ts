import "server-only";

import { executeTrustedWrite } from "@/lib/db/write-pool";
import { getDefaultQueryEmbedder } from "@/lib/retrieval/embedder";
import type { GlossaryHit } from "@/lib/retrieval/glossary";
import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import type { SqlValue } from "@/lib/sql/types";

// Semantic answer cache. A question is embedded with the same model the glossary
// uses, then matched against stored entries by cosine similarity. A hit returns
// the full auditable bundle that the live pipeline would have produced, so it is a
// deterministic replay rather than a fresh generation.
//
// The lookup is read only and runs through the same read only transaction as the
// rest of the read path. The write is a single parameterized insert through the
// trusted write pool. Neither path ever executes model written SQL.

export type CachedAnswer = {
  answer: string;
  generatedSql: string;
  executedSql: string;
  columns: string[];
  rows: Record<string, SqlValue>[];
  rowCount: number;
  truncated: boolean;
  grounded: boolean;
  ungroundedNumbers: string[];
  glossary: GlossaryHit[];
  model: string;
};

type CacheLookupRow = {
  answer: string;
  generated_sql: string;
  executed_sql: string;
  result_columns: unknown;
  result_rows: unknown;
  row_count: number | string;
  truncated: boolean;
  grounded: boolean;
  ungrounded_numbers: unknown;
  glossary: unknown;
  model: string;
  similarity: number | string;
};

export async function embedQuestion(question: string): Promise<number[]> {
  const [embedding] = await getDefaultQueryEmbedder().embed([question]);
  return embedding;
}

export async function lookupCachedAnswer(
  embedding: number[],
  similarityThreshold: number,
  maxAgeSeconds: number,
): Promise<CachedAnswer | null> {
  const vector = toVectorLiteral(embedding);
  const maxDistance = 1 - similarityThreshold;
  const freshnessClause =
    maxAgeSeconds > 0
      ? "and created_at >= now() - ($3 || ' seconds')::interval"
      : "";

  const values: unknown[] = [vector, maxDistance];
  if (maxAgeSeconds > 0) {
    values.push(String(Math.floor(maxAgeSeconds)));
  }

  const result = await executeSqlInReadOnlyTransaction(
    `
      select
        answer,
        generated_sql,
        executed_sql,
        result_columns,
        result_rows,
        row_count,
        truncated,
        grounded,
        ungrounded_numbers,
        glossary,
        model,
        1 - (embedding <=> $1::vector) as similarity
      from query_cache
      where (embedding <=> $1::vector) <= $2
        ${freshnessClause}
      order by embedding <=> $1::vector
      limit 1
    `,
    1,
    5_000,
    values,
  );

  if (!result.ok || result.rows.length === 0) {
    return null;
  }

  return toCachedAnswer(result.rows[0] as unknown as CacheLookupRow);
}

export async function storeCachedAnswer(
  question: string,
  embedding: number[],
  entry: CachedAnswer,
): Promise<void> {
  try {
    await executeTrustedWrite(
      `
        insert into query_cache (
          question,
          embedding,
          answer,
          generated_sql,
          executed_sql,
          result_columns,
          result_rows,
          row_count,
          truncated,
          grounded,
          ungrounded_numbers,
          glossary,
          model
        )
        values ($1, $2::vector, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11::jsonb, $12::jsonb, $13)
      `,
      [
        question,
        toVectorLiteral(embedding),
        entry.answer,
        entry.generatedSql,
        entry.executedSql,
        JSON.stringify(entry.columns),
        JSON.stringify(entry.rows),
        entry.rowCount,
        entry.truncated,
        entry.grounded,
        JSON.stringify(entry.ungroundedNumbers),
        JSON.stringify(entry.glossary),
        entry.model,
      ],
    );
  } catch (error) {
    // A cache write failure must never break answering. Log and move on.
    console.error(
      "query cache write failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

function toCachedAnswer(row: CacheLookupRow): CachedAnswer {
  return {
    answer: row.answer,
    generatedSql: row.generated_sql,
    executedSql: row.executed_sql,
    columns: toStringArray(row.result_columns),
    rows: toRowArray(row.result_rows),
    rowCount: Number(row.row_count) || 0,
    truncated: Boolean(row.truncated),
    grounded: Boolean(row.grounded),
    ungroundedNumbers: toStringArray(row.ungrounded_numbers),
    glossary: toGlossaryHits(row.glossary),
    model: row.model,
  };
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toPrecision(9)).join(",")}]`;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  return [];
}

function toRowArray(value: unknown): Record<string, SqlValue>[] {
  if (Array.isArray(value)) {
    return value as Record<string, SqlValue>[];
  }

  return [];
}

function toGlossaryHits(value: unknown): GlossaryHit[] {
  if (Array.isArray(value)) {
    return value as GlossaryHit[];
  }

  return [];
}
