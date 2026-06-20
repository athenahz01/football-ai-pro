-- Per IP rate limiting for Phase 1 cost control.
-- This migration is additive and idempotent. It only creates a table and an index
-- with "if not exists" and never drops, alters, or deletes existing data.
-- Counters use fixed time windows. One row counts the requests from a single client
-- IP within a single window of a single kind, for example one minute or one day.
-- The limiter increments the counter through the trusted parameterized write path
-- before any model call, so abuse cannot run up model cost. This table is
-- infrastructure and is never queried by the text to SQL model.

create table if not exists rate_limit_counters (
  ip text not null,
  window_kind text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (ip, window_kind, window_start),
  constraint rate_limit_counters_window_kind_check check (window_kind in ('minute', 'day'))
);

comment on table rate_limit_counters is 'Fixed window request counters for per IP rate limiting. One row per client IP, window kind, and window start. Infrastructure only.';
comment on column rate_limit_counters.ip is 'Client IP address the counter belongs to.';
comment on column rate_limit_counters.window_kind is 'Window granularity for the counter: minute or day.';
comment on column rate_limit_counters.window_start is 'Start of the fixed time window this counter covers.';
comment on column rate_limit_counters.request_count is 'Number of requests counted for this IP in this window.';

create index if not exists rate_limit_counters_window_start_idx on rate_limit_counters (window_start);
