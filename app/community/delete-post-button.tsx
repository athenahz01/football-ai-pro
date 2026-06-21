"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/matchday/button";

// Delete control for a post the signed in viewer owns, restyled onto MATCHDAY. The
// detail page only renders this when the server decided the session user is the
// author, and the delete endpoint re checks ownership from the session, so the body
// can never authorize a delete of someone else's post.

export function DeletePostButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/community", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "That did not work. Please try again.");
        return;
      }
      router.push("/community");
      router.refresh();
    } catch {
      setError("The request failed. Check that the dev server is running.");
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
      <Button variant="secondary" size="sm" onClick={remove} disabled={busy}>
        {busy ? "Deleting" : "Delete this post"}
      </Button>
      {error !== null ? (
        <span className="md-small" style={{ color: "var(--md-down)" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
