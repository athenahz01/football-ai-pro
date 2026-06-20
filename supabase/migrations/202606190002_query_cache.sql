-- Semantic answer cache for Phase 1 cost control.
-- This migration is additive and idempotent. It only creates a table and indexes
-- with "if not exists" and never drops, alters, or deletes existing data.
-- A cache entry stores a previously answered question, its embedding, and the full
-- auditable answer bundle so a near identical question can be served without a new
-- model call. A cache hit is a deterministic replay of a real grounded answer, so
-- it is no less auditable than a live answer. This table is infrastructure and is
-- never shown to the text to SQL model or queried by model written SQL.

create table if not exists query_cache (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  embedding vector(384) not null,
  answer text not null,
  generated_sql text not null,
  executed_sql text not null,
  result_columns jsonb not null default '[]'::jsonb,
  result_rows jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  truncated boolean not null default false,
  grounded boolean not null default true,
  ungrounded_numbers jsonb not null default '[]'::jsonb,
  glossary jsonb not null default '[]'::jsonb,
  model text not null,
  created_at timestamptz not null default now()
);

comment on table query_cache is 'Semantic cache of previously answered grounded questions. Each row stores the question, its embedding, and the full auditable answer bundle for deterministic replay. Infrastructure only, never queried by the text to SQL model.';
comment on column query_cache.id is 'Stable identifier for the cache entry.';
comment on column query_cache.question is 'Original natural language question that produced this answer.';
comment on column query_cache.embedding is 'Embedding of the question using the same 384 dimension model as the glossary, for cosine similarity lookup.';
comment on column query_cache.answer is 'Grounded natural language answer that was returned for the question.';
comment on column query_cache.generated_sql is 'SQL the model generated for the question.';
comment on column query_cache.executed_sql is 'Read only SQL that was actually executed after the guard normalized it.';
comment on column query_cache.result_columns is 'Column names of the executed query result, stored as a JSON array.';
comment on column query_cache.result_rows is 'Executed query result rows, stored as JSON so the cached answer carries its real evidence.';
comment on column query_cache.row_count is 'Number of rows the executed query returned.';
comment on column query_cache.truncated is 'True when the executed query result was truncated by the row cap.';
comment on column query_cache.grounded is 'Whether the stored answer passed the grounding check when it was produced.';
comment on column query_cache.ungrounded_numbers is 'Any numbers the grounding check could not trace to a row, stored as a JSON array.';
comment on column query_cache.glossary is 'Glossary retrieval context used for the answer, stored as JSON for auditing.';
comment on column query_cache.model is 'Model that produced the stored answer.';
comment on column query_cache.created_at is 'Timestamp when the cache entry was written, used for the freshness window.';

create index if not exists query_cache_embedding_hnsw_idx on query_cache using hnsw (embedding vector_cosine_ops);
create index if not exists query_cache_created_at_idx on query_cache (created_at);
