import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  markSubscriptionCanceledFromStripe,
  upsertSubscriptionFromStripe,
} from "@/lib/billing/service";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/billing/stripe";

export const runtime = "nodejs";

const HANDLED_SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripeClient().webhooks.constructEvent(
      body,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    console.error("stripe webhook verification failed:", error);
    return NextResponse.json(
      { error: "Invalid Stripe webhook signature." },
      { status: 400 },
    );
  }

  if (!HANDLED_SUBSCRIPTION_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true });
  }

  try {
    const subscription = event.data.object as Stripe.Subscription;
    const input = {
      stripeCustomerId: readCustomerId(subscription),
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: readCurrentPeriodEnd(subscription),
    };

    if (event.type === "customer.subscription.deleted") {
      await markSubscriptionCanceledFromStripe(input);
    } else {
      await upsertSubscriptionFromStripe(input);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("stripe webhook handling failed:", error);
    return NextResponse.json(
      { error: "Stripe webhook could not be applied." },
      { status: 500 },
    );
  }
}

function readCustomerId(subscription: Stripe.Subscription): string {
  const customer = subscription.customer;

  if (typeof customer === "string") {
    return customer;
  }

  if (customer && "id" in customer) {
    return customer.id;
  }

  throw new Error("Stripe subscription has no customer id.");
}

function readCurrentPeriodEnd(
  subscription: Stripe.Subscription,
): string | null {
  const value =
    "current_period_end" in subscription
      ? subscription.current_period_end
      : undefined;

  return typeof value === "number"
    ? new Date(value * 1000).toISOString()
    : null;
}
