import { NextRequest, NextResponse } from "next/server";

import { getBillingAccountByUserId } from "@/lib/billing/service";
import { getStripeClient } from "@/lib/billing/stripe";
import { getAuthenticatedUser } from "@/lib/supabase/server-client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in to manage billing." },
        { status: 401 },
      );
    }

    const account = await getBillingAccountByUserId(user.id);
    if (!account?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer exists for this user." },
        { status: 404 },
      );
    }

    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${origin}/ask`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("billing portal failed:", error);
    return NextResponse.json(
      { error: "Could not open the billing portal." },
      { status: 500 },
    );
  }
}
