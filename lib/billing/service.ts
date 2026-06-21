import "server-only";

import { executeTrustedWrite } from "@/lib/db/write-pool";
import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";

import type {
  BillingAccount,
  PublicBillingState,
  SubscriptionTier,
  UserEntitlement,
} from "./types";

const ACTIVE_PREMIUM_STATUSES = new Set(["active", "trialing"]);

const FREE_ENTITLEMENT: UserEntitlement = {
  tier: "free",
  status: null,
  currentPeriodEnd: null,
};

type SubscriptionRow = {
  user_id: string;
  tier: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  current_period_end: Date | string | null;
};

type SubscriptionWriteInput = {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
};

export async function getCurrentUserBillingState(): Promise<PublicBillingState> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      authenticated: false,
      canManageBilling: false,
      ...FREE_ENTITLEMENT,
    };
  }

  const account = await getBillingAccountByUserId(user.id);
  const entitlement = account
    ? {
        tier: account.tier,
        status: account.status,
        currentPeriodEnd: account.currentPeriodEnd,
      }
    : FREE_ENTITLEMENT;

  return {
    authenticated: true,
    canManageBilling: Boolean(account?.stripeCustomerId),
    ...entitlement,
  };
}

export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  return (await getUserEntitlementByUserId(userId)).tier;
}

export async function getUserEntitlementByUserId(
  userId: string,
): Promise<UserEntitlement> {
  const account = await getBillingAccountByUserId(userId);
  if (!account) {
    return FREE_ENTITLEMENT;
  }

  return {
    tier: account.tier,
    status: account.status,
    currentPeriodEnd: account.currentPeriodEnd,
  };
}

export async function getBillingAccountByUserId(
  userId: string,
): Promise<BillingAccount | null> {
  const result = await executeSqlInReadOnlyTransaction(
    `
      select
        user_id,
        tier,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_subscription_status,
        current_period_end
      from user_subscriptions
      where user_id = $1
    `,
    1,
    5_000,
    [userId],
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  const row = result.rows[0] as SubscriptionRow | undefined;
  return row ? mapBillingAccount(row) : null;
}

export async function upsertStripeCustomerForUser(
  userId: string,
  stripeCustomerId: string,
): Promise<BillingAccount> {
  const result = await executeTrustedWrite<SubscriptionRow>(
    `
      insert into user_subscriptions (user_id, tier, stripe_customer_id, updated_at)
      values ($1, 'free', $2, timezone('utc', now()))
      on conflict (user_id)
      do update set
        stripe_customer_id = excluded.stripe_customer_id,
        updated_at = timezone('utc', now())
      returning
        user_id,
        tier,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_subscription_status,
        current_period_end
    `,
    [userId, stripeCustomerId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Stripe customer record was not saved.");
  }

  return mapBillingAccount(row);
}

export async function upsertSubscriptionFromStripe(
  input: SubscriptionWriteInput,
): Promise<BillingAccount> {
  const tier: SubscriptionTier = isPremiumStatus(input.status)
    ? "premium"
    : "free";

  const result = await executeTrustedWrite<SubscriptionRow>(
    `
      update user_subscriptions
      set
        tier = $2,
        stripe_subscription_id = $3,
        stripe_subscription_status = $4,
        current_period_end = $5,
        updated_at = timezone('utc', now())
      where stripe_customer_id = $1
      returning
        user_id,
        tier,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_subscription_status,
        current_period_end
    `,
    [
      input.stripeCustomerId,
      tier,
      input.stripeSubscriptionId,
      input.status,
      input.currentPeriodEnd,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(
      "No local subscription record exists for this Stripe customer.",
    );
  }

  return mapBillingAccount(row);
}

export async function markSubscriptionCanceledFromStripe(
  input: SubscriptionWriteInput,
): Promise<BillingAccount> {
  const result = await executeTrustedWrite<SubscriptionRow>(
    `
      update user_subscriptions
      set
        tier = 'free',
        stripe_subscription_id = $2,
        stripe_subscription_status = $3,
        current_period_end = $4,
        updated_at = timezone('utc', now())
      where stripe_customer_id = $1
      returning
        user_id,
        tier,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_subscription_status,
        current_period_end
    `,
    [
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.status,
      input.currentPeriodEnd,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(
      "No local subscription record exists for this Stripe customer.",
    );
  }

  return mapBillingAccount(row);
}

function mapBillingAccount(row: SubscriptionRow): BillingAccount {
  const status = row.stripe_subscription_status;
  const storedTier = row.tier === "premium" ? "premium" : "free";
  const tier =
    storedTier === "premium" && isPremiumStatus(status) ? "premium" : "free";

  return {
    userId: row.user_id,
    tier,
    status,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodEnd: toIsoString(row.current_period_end),
  };
}

function isPremiumStatus(status: string | null): boolean {
  return status !== null && ACTIVE_PREMIUM_STATUSES.has(status);
}

function toIsoString(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}
