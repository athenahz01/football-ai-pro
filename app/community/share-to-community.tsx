"use client";

import Link from "next/link";
import { useState } from "react";

import type { PostKind } from "@/lib/community/service";

// The share to community action for the comparison, scouting, and replay pages. It
// posts the current view's parameters, never numbers, to the community endpoint,
// where the author is taken from the session. Signed out users get a clean sign in
// prompt rather than a broken action.

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
      <p style={styles.prompt}>
        <Link href="/auth" style={styles.link}>
          Sign in
        </Link>{" "}
        to share this to the community feed.
      </p>
    );
  }

  if (sharedId !== null) {
    return (
      <p style={styles.shared}>
        Shared.{" "}
        <Link href={`/community/${sharedId}`} style={styles.link}>
          View your post
        </Link>{" "}
        or open the{" "}
        <Link href="/community" style={styles.link}>
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
    <div style={styles.box}>
      <label style={styles.label}>
        Share this to the community
        <input
          type="text"
          value={caption}
          maxLength={280}
          placeholder="Add an optional caption"
          onChange={(event) => setCaption(event.target.value)}
          style={styles.input}
        />
      </label>
      <button type="button" onClick={share} disabled={busy} style={styles.button}>
        {busy ? "Sharing" : "Share to community"}
      </button>
      {error !== null ? <span style={styles.error}>{error}</span> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    marginTop: "16px",
    padding: "14px",
    border: "1px solid #eee",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxWidth: "420px",
  },
  label: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#555" },
  input: {
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
  },
  button: {
    alignSelf: "flex-start",
    padding: "9px 18px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#111",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  prompt: { marginTop: "16px", fontSize: "14px", color: "#555" },
  shared: { marginTop: "16px", fontSize: "14px", color: "#555", lineHeight: 1.5 },
  link: { color: "#333" },
  error: { fontSize: "13px", color: "#b00020" },
};
