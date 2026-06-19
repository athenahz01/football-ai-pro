from __future__ import annotations

import argparse
from typing import Any, Sequence

import psycopg

from analytics import db
from analytics.embeddings import EMBEDDING_DIMENSION, Embedder, get_default_embedder
from analytics.glossary_data import GLOSSARY_ENTRIES, GlossaryEntry

BATCH_SIZE = 100


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the retrieval glossary.")
    parser.add_argument(
        "--verify-idempotency",
        action="store_true",
        help="Run twice and verify the glossary row count does not change.",
    )
    args = parser.parse_args()

    embedder = get_default_embedder()
    first_count = seed_once(embedder)

    if args.verify_idempotency:
        print("Running glossary seed a second time to verify idempotency.")
        second_count = seed_once(embedder)
        if first_count != second_count:
            raise RuntimeError(
                f"Idempotency check failed. glossary_terms rows were {first_count} then {second_count}."
            )
        print("Idempotency check passed. Row count was unchanged.")


def seed_once(embedder: Embedder) -> int:
    texts = [build_embedding_text(entry) for entry in GLOSSARY_ENTRIES]
    vectors = embedder.embed(texts)
    rows = [to_row(entry, vector) for entry, vector in zip(GLOSSARY_ENTRIES, vectors)]

    with db.connect() as connection:
        upsert_glossary_terms(connection, rows)
        row_count = count_glossary_terms(connection)

    print(
        f"Glossary seed complete. Embedded {len(rows)} terms, final rows {row_count}."
    )
    return row_count


def build_embedding_text(entry: GlossaryEntry) -> str:
    parts = [
        f"term: {entry.term}",
        f"aliases: {', '.join(entry.aliases)}",
        f"category: {entry.category}",
        f"definition: {entry.definition}",
        f"tables: {', '.join(entry.related_tables)}",
        f"columns: {', '.join(entry.related_columns)}",
        f"values: {', '.join(entry.value_examples)}",
    ]
    return "\n".join(parts)


def to_row(entry: GlossaryEntry, vector: Sequence[float]) -> dict[str, Any]:
    if len(vector) != EMBEDDING_DIMENSION:
        raise ValueError(
            f"Embedding for {entry.term_id} has {len(vector)} dimensions, expected {EMBEDDING_DIMENSION}."
        )

    return {
        "term_id": entry.term_id,
        "term": entry.term,
        "aliases": entry.aliases,
        "category": entry.category,
        "definition": entry.definition,
        "related_tables": entry.related_tables,
        "related_columns": entry.related_columns,
        "value_examples": entry.value_examples,
        "embedding": vector_literal(vector),
    }


def upsert_glossary_terms(
    connection: psycopg.Connection[Any],
    rows: Sequence[dict[str, Any]],
) -> None:
    if not rows:
        return

    statement = """
        insert into glossary_terms (
          term_id,
          term,
          aliases,
          category,
          definition,
          related_tables,
          related_columns,
          value_examples,
          embedding
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
        on conflict (term_id)
        do update set
          term = excluded.term,
          aliases = excluded.aliases,
          category = excluded.category,
          definition = excluded.definition,
          related_tables = excluded.related_tables,
          related_columns = excluded.related_columns,
          value_examples = excluded.value_examples,
          embedding = excluded.embedding
    """

    with connection.cursor() as cursor:
        for batch in batched(rows, BATCH_SIZE):
            cursor.executemany(
                statement,
                [
                    (
                        row["term_id"],
                        row["term"],
                        row["aliases"],
                        row["category"],
                        row["definition"],
                        row["related_tables"],
                        row["related_columns"],
                        row["value_examples"],
                        row["embedding"],
                    )
                    for row in batch
                ],
            )

    connection.commit()


def count_glossary_terms(connection: psycopg.Connection[Any]) -> int:
    with connection.cursor() as cursor:
        cursor.execute("select count(*) from glossary_terms")
        value = cursor.fetchone()

    return int(value[0]) if value is not None else 0


def vector_literal(vector: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.9g}" for value in vector) + "]"


def batched(
    rows: Sequence[dict[str, Any]],
    size: int,
) -> list[Sequence[dict[str, Any]]]:
    return [rows[start : start + size] for start in range(0, len(rows), size)]


if __name__ == "__main__":
    main()
