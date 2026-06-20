"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Status =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "signed-in"; email: string };

export function AuthStatus() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      // Auth is not configured yet. Leave the placeholder bar; the product still
      // works signed out.
      return;
    }

    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) {
        return;
      }
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

  async function signOut() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      return;
    }
    router.refresh();
  }

  if (status.state === "loading") {
    return <div style={styles.bar} aria-hidden />;
  }

  if (status.state === "signed-in") {
    return (
      <div style={styles.bar}>
        <span style={styles.email}>{status.email}</span>
        <button type="button" style={styles.action} onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div style={styles.bar}>
      <Link href="/auth" style={styles.action}>
        Sign in
      </Link>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "12px",
    minHeight: "24px",
    marginBottom: "8px",
    fontSize: "13px",
  },
  email: { color: "#555" },
  action: {
    padding: 0,
    fontSize: "13px",
    color: "#333",
    background: "none",
    border: "none",
    cursor: "pointer",
    textDecoration: "underline",
  },
};
