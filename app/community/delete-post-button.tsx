"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Delete control for a post the signed in viewer owns. The detail page only renders
// this when the server decided the session user is the author, and the delete
// endpoint re checks ownership from the session, so the body can never authorize a
// delete of someone else's post.

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
    <span>
      <button type="button" onClick={remove} disabled={busy} style={styles.button}>
        {busy ? "Deleting" : "Delete this post"}
      </button>
      {error !== null ? <span style={styles.error}> {error}</span> : null}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    padding: "8px 16px",
    fontSize: "13px",
    color: "#333",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "8px",
    cursor: "pointer",
  },
  error: { fontSize: "13px", color: "#b00020", marginLeft: "8px" },
};
