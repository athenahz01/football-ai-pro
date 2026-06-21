import { getCurrentUserBillingState } from "@/lib/billing/service";

import { AskClient } from "./ask-client";

// Server wrapper. It reads an optional prefilled question from the URL, for
// example a personalized suggestion link from the following page, and seeds the
// client form with it. The question is still sent through the normal grounded
// pipeline; nothing here precomputes an answer.

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.q;
  const initialQuestion = typeof raw === "string" ? raw.slice(0, 500) : "";
  const billing = await getCurrentUserBillingState();

  return <AskClient initialQuestion={initialQuestion} billing={billing} />;
}
