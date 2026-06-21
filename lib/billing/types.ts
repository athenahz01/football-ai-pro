export type SubscriptionTier = "free" | "premium";

export type UserEntitlement = {
  tier: SubscriptionTier;
  status: string | null;
  currentPeriodEnd: string | null;
};

export type BillingAccount = UserEntitlement & {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type PublicBillingState = UserEntitlement & {
  authenticated: boolean;
  canManageBilling: boolean;
};
