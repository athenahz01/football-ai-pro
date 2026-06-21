"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// Account affordance in the nav. Signed in shows the user initial linking to the
// profile, signed out shows a sign in link. It reuses the existing Supabase browser
// client; it does not change auth, only reflects it.

type Status =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "signed-in"; email: string };

export function AccountChip() {
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    let active = true;
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      // Auth is not configured. Deferred so the state change does not run
      // synchronously inside the effect.
      queueMicrotask(() => {
        if (active) {
          setStatus({ state: "signed-out" });
        }
      });
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setStatus(
        data.user?.email
          ? { state: "signed-in", email: data.user.email }
          : { state: "signed-out" },
      );
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setStatus(
          session?.user?.email
            ? { state: "signed-in", email: session.user.email }
            : { state: "signed-out" },
        );
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (status.state === "loading") {
    return <span className="md-account" aria-hidden style={{ opacity: 0.5 }} />;
  }

  if (status.state === "signed-in") {
    const initial = status.email.trim().charAt(0).toUpperCase() || "Y";
    return (
      <Link href="/you" className="md-account" aria-label="Your profile">
        {initial}
      </Link>
    );
  }

  return (
    <Link href="/auth" className="md-account" aria-label="Sign in">
      Sign in
    </Link>
  );
}
