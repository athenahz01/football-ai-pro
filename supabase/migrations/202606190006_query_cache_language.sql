-- Language aware semantic cache for Phase 1 multilingual output.
-- This migration is additive and idempotent. It only adds a column and an index
-- with "if not exists" and never drops, alters away, or deletes existing data.
-- The cache now records the language the stored answer was written in. The lookup
-- and the write both include the language, so a cached English answer is never
-- served for a Spanish request and the other way round. Existing rows default to
-- English, which is correct because every prior cached answer was English.

alter table query_cache
  add column if not exists language text not null default 'en';

comment on column query_cache.language is 'Language code the cached answer was written in, such as en, es, fr, pt, or de. The cache lookup filters on this so there is no cross language cache bleed. The numbers in the answer are the same across languages; only the wording differs.';

create index if not exists query_cache_language_idx on query_cache (language);
