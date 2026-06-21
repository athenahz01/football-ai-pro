-- Community feed for Phase 2, the small sharing layer on top of the comparison,
-- scouting, and replay views.
-- This migration is additive and idempotent. It only creates a table and indexes
-- with "if not exists" and never drops, alters away, or deletes existing data, and
-- it never rewrites an existing key.
--
-- A row is one thing a signed in user chose to share. It stores the parameters that
-- produce the view, the competition, the entities, the metric, or the clip, never a
-- snapshot of the numbers. When the feed renders a post it re runs the same fixed
-- read only queries from those parameters, so the numbers are always real and
-- current, never a stored, possibly stale figure. The author is the Supabase auth
-- user id and is always taken from the server session, never from request input, so
-- a user can only publish as themselves and only delete their own posts. This table
-- is infrastructure for the feed and is never queried by the text to SQL model.

create table if not exists shared_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('comparison', 'leaderboard', 'replay')),
  params jsonb not null,
  caption text,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint shared_posts_caption_length_check
    check (caption is null or char_length(caption) <= 280)
);

comment on table shared_posts is 'Public community feed of comparison, leaderboard, and replay views that signed in users chose to share. One row per post. The post stores the parameters that produce the view, never the numbers, so the feed always renders live real data by re running the fixed read only queries. The author is taken from the server session, never from request input.';
comment on column shared_posts.id is 'Stable post identifier.';
comment on column shared_posts.author_user_id is 'Supabase auth user id that published this post. Always taken from the server session, never from request input. A user can only publish as themselves and only delete their own posts.';
comment on column shared_posts.kind is 'What the post renders: comparison, leaderboard, or replay. Validated against the kinds the insights and replay layers support.';
comment on column shared_posts.params is 'The parameters needed to re render the view, for example competition, entities, metric, or clip. Parameters, not numbers, so the feed always renders live current data, never a stored snapshot. Validated on publish against the allowed competitions, metrics, and clips so a post can only point at a real, renderable view.';
comment on column shared_posts.caption is 'Optional short caption the author wrote, at most 280 characters.';
comment on column shared_posts.view_count is 'Number of single post views, incremented through the trusted write path when the post detail page is opened.';
comment on column shared_posts.created_at is 'Timestamp when the post was published.';

create index if not exists shared_posts_created_at_idx on shared_posts (created_at desc);
create index if not exists shared_posts_author_idx on shared_posts (author_user_id);
