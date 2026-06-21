import "server-only";

import Stripe from "stripe";

import { config } from "@/lib/config/env";

let stripeClient: Stripe | undefined;

export function getStripeClient(): Stripe {
  const secretKey = config.stripeSecretKey;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const webhookSecret = config.stripeWebhookSecret;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }

  return webhookSecret;
}

export function getPremiumPriceId(): string {
  const priceId = config.stripePremiumPriceId;
  if (!priceId) {
    throw new Error("STRIPE_PREMIUM_PRICE_ID is not configured.");
  }

  return priceId;
}
