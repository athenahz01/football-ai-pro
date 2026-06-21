import { NextRequest, NextResponse } from "next/server";

import {
  getBillingAccountByUserId,
  upsertStripeCustomerForUser,
} from "@/lib/billing/service";
import { getPremiumPriceId, getStripeClient } from "@/lib/billing/stripe";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in to upgrade." },
        { status: 401 },
      );
    }

    const stripe = getStripeClient();
    const priceId = getPremiumPriceId();
    const account = await getBillingAccountByUserId(user.id);
    const customerId =
      account?.stripeCustomerId ??
      (await createStripeCustomerForUser({
        userId: user.id,
        email: user.email,
      }));

    if (!account?.stripeCustomerId) {
      await upsertStripeCustomerForUser(user.id, customerId);
    }

    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/ask?billing=success`,
      cancel_url: `${origin}/ask?billing=cancel`,
      client_reference_id: user.id,
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("billing checkout failed:", error);
    return NextResponse.json(
      { error: "Could not start checkout." },
      { status: 500 },
    );
  }
}

async function createStripeCustomerForUser({
  userId,
  email,
}: {
  userId: string;
  email: string | undefined;
}): Promise<string> {
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });

  return customer.id;
}
