import "server-only";

import {
  getDefaultQueryEmbedder,
  type QueryEmbedder,
} from "@/lib/retrieval/embedder";
import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";

export type GlossaryHit = {
  termId: string;
  term: string;
  aliases: string[];
  category: string;
  definition: string;
  relatedTables: string[];
  relatedColumns: string[];
  valueExamples: string[];
  distance: number;
};

type RetrieveGlossaryOptions = {
  topK?: number;
  embedder?: QueryEmbedder;
};

const DEFAULT_GLOSSARY_TOP_K = 8;

export async function retrieveGlossary(
  question: string,
  options: RetrieveGlossaryOptions = {},
): Promise<GlossaryHit[]> {
  const topK = options.topK ?? DEFAULT_GLOSSARY_TOP_K;
  const embedder = options.embedder ?? getDefaultQueryEmbedder();
  const [embedding] = await embedder.embed([question]);
  const vector = toVectorLiteral(embedding);

  const result = await executeSqlInReadOnlyTransaction(
    `
      select
        term_id,
        term,
        aliases,
        category,
        definition,
        related_tables,
        related_columns,
        value_examples,
        embedding <=> $1::vector as distance
      from glossary_terms
      order by embedding <=> $1::vector
      limit $2
    `,
    topK,
    5_000,
    [vector, topK],
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.rows.map((row) => ({
    termId: String(row.term_id),
    term: String(row.term),
    aliases: toStringArray(row.aliases),
    category: String(row.category),
    definition: String(row.definition),
    relatedTables: toStringArray(row.related_tables),
    relatedColumns: toStringArray(row.related_columns),
    valueExamples: toStringArray(row.value_examples),
    distance: Number(row.distance),
  }));
}

export function formatGlossaryHits(hits: GlossaryHit[]): string {
  if (hits.length === 0) {
    return "No glossary entries retrieved.";
  }

  return hits
    .map((hit, index) => {
      const values =
        hit.valueExamples.length > 0
          ? `\nExact values: ${hit.valueExamples.join(", ")}`
          : "";

      return [
        `${index + 1}. ${hit.term} (${hit.category})`,
        `Definition: ${hit.definition}`,
        `Tables: ${hit.relatedTables.join(", ")}`,
        `Columns: ${hit.relatedColumns.join(", ")}`,
        values.trim(),
      ]
        .filter((part) => part.length > 0)
        .join("\n");
    })
    .join("\n\n");
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toPrecision(9)).join(",")}]`;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  return [];
}
