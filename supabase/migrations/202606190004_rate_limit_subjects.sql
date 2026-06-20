-- Per subject rate limiting for Phase 1 authentication.
-- This migration is additive and idempotent. It only creates a table and an index
-- with "if not exists" and never drops, alters, or deletes existing data. The
-- earlier rate_limit_counters table is left exactly as it is.
-- This generalizes the limiter key from an IP to a subject that is either an IP,
-- for anonymous traffic, or a signed in user id. One row counts the requests from
-- a single subject within a single fixed time window of a single kind. The limiter
-- increments these counters through the trusted parameterized write path before
-- any model call. This table is infrastructure and is never queried by the text to
-- SQL model.

create table if not exists rate_limit_usage (
  subject_kind text not null,
  subject text not null,
  window_kind text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (subject_kind, subject, window_kind, window_start),
  constraint rate_limit_usage_subject_kind_check check (subject_kind in ('ip', 'user')),
  constraint rate_limit_usage_window_kind_check check (window_kind in ('minute', 'day'))
);

comment on table rate_limit_usage is 'Fixed window request counters keyed on a rate limit subject. The subject is an IP address for anonymous traffic or a user id for signed in traffic. One row per subject, window kind, and window start. Infrastructure only.';
comment on column rate_limit_usage.subject_kind is 'Kind of subject the counter belongs to: ip for anonymous traffic or user for a signed in user.';
comment on column rate_limit_usage.subject is 'The subject value, an IP address when subject_kind is ip or a user id when subject_kind is user.';
comment on column rate_limit_usage.window_kind is 'Window granularity for the counter: minute or day.';
comment on column rate_limit_usage.window_start is 'Start of the fixed time window this counter covers.';
comment on column rate_limit_usage.request_count is 'Number of requests counted for this subject in this window.';

create index if not exists rate_limit_usage_window_start_idx on rate_limit_usage (window_start);
