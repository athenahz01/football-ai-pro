import { NextResponse } from "next/server";

import { getCurrentUserBillingState } from "@/lib/billing/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getCurrentUserBillingState());
  } catch (error) {
    console.error("billing entitlement failed:", error);
    return NextResponse.json(
      { error: "Could not load billing status." },
      { status: 500 },
    );
  }
}
