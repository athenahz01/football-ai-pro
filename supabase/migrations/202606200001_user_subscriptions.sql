-- Subscription and entitlement foundation for Phase 3 monetization.
-- Additive and idempotent. This migration creates one infrastructure table and
-- indexes only. It never drops, deletes, or rewrites existing data.
-- No row for a user means the user is on the free tier.

create table if not exists user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  current_period_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_subscriptions_tier_check check (tier in ('free', 'premium'))
);

comment on table user_subscriptions is 'Billing entitlement record for a Supabase auth user. No row means the user is on the free tier. A premium row is managed by Stripe webhooks through the trusted write path.';
comment on column user_subscriptions.user_id is 'Supabase auth user id that owns this subscription and entitlement record.';
comment on column user_subscriptions.tier is 'Application entitlement tier for this user. Values are free or premium. Premium features must only use commercially licensed or owned data.';
comment on column user_subscriptions.stripe_customer_id is 'Stripe customer id created for this signed in user. Used by webhooks to map Stripe events back to the Supabase user.';
comment on column user_subscriptions.stripe_subscription_id is 'Stripe subscription id for the user premium subscription when one exists.';
comment on column user_subscriptions.stripe_subscription_status is 'Latest Stripe subscription status observed by webhook, such as active, trialing, past_due, canceled, unpaid, incomplete, or incomplete_expired.';
comment on column user_subscriptions.current_period_end is 'End time for the current Stripe subscription period when Stripe provides it.';
comment on column user_subscriptions.created_at is 'Time when this local subscription record was first created.';
comment on column user_subscriptions.updated_at is 'Time when this local subscription record was last updated by checkout setup or webhook processing.';

create unique index if not exists user_subscriptions_stripe_customer_id_idx
  on user_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists user_subscriptions_stripe_subscription_id_idx
  on user_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists user_subscriptions_tier_idx on user_subscriptions (tier);
