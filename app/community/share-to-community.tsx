"use client";

import Link from "next/link";
import { useState } from "react";

import type { PostKind } from "@/lib/community/service";
import { Button } from "@/components/matchday/button";

// The share to community action for the comparison, scouting, and replay pages,
// restyled onto MATCHDAY. It posts the current view's parameters, never numbers, to
// the community endpoint, where the author is taken from the session. Signed out
// users get a clean sign in prompt rather than a broken action.

export function ShareToCommunity({
  kind,
  params,
  signedIn,
}: {
  kind: PostKind;
  params: Record<string, string | number>;
  signedIn: boolean;
}) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <p
        className="md-small"
        style={{ color: "var(--md-text-mid)", marginTop: "var(--space-4)" }}
      >
        <Link href="/auth" style={{ color: "var(--md-volt)" }}>
          Sign in
        </Link>{" "}
        to share this to the community feed.
      </p>
    );
  }

  if (sharedId !== null) {
    return (
      <p
        className="md-small"
        style={{ color: "var(--md-text-mid)", marginTop: "var(--space-4)" }}
      >
        Shared.{" "}
        <Link href={`/community/${sharedId}`} style={{ color: "var(--md-volt)" }}>
          View your post
        </Link>{" "}
        or open the{" "}
        <Link href="/community" style={{ color: "var(--md-volt)" }}>
          community feed
        </Link>
        .
      </p>
    );
  }

  async function share() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          params,
          caption: caption.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "That did not work. Please try again.");
        return;
      }
      setSharedId(data.id);
    } catch {
      setError("The request failed. Check that the dev server is running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="md-panel"
      style={{
        marginTop: "var(--space-4)",
        maxWidth: "440px",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <label className="md-field" style={{ minWidth: 0 }}>
        Share this to the community
        <input
          className="md-input"
          type="text"
          value={caption}
          maxLength={280}
          placeholder="Add an optional caption"
          onChange={(event) => setCaption(event.target.value)}
        />
      </label>
      <Button
        variant="primary"
        size="md"
        onClick={share}
        disabled={busy}
        style={{ alignSelf: "flex-start" }}
      >
        {busy ? "Sharing" : "Share to community"}
      </Button>
      {error !== null ? (
        <span className="md-small" style={{ color: "var(--md-down)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
