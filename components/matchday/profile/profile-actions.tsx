"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "../button";

// Inline actions on an entity profile: follow, compare prefilled with this entity,
// copy a share link, and grounded questions about it. Follow goes through the existing
// follows API, where the author comes from the session. Sharing here is a copy link,
// since the community supports comparison, leaderboard, and replay posts, not profile
// posts, and adding a profile post kind would be a backend change.

type FollowKind = "player" | "team";

export function ProfileActions({
  kind,
  id,
  name,
  competitionId,
}: {
  kind: FollowKind;
  id: string;
  name: string;
  competitionId: string;
}) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/follows")
      .then((response) => (response.ok ? response.json() : []))
      .then((items: { type: string; id: string }[]) => {
        if (!active) return;
        setFollowing(
          Array.isArray(items) &&
            items.some((item) => item.type === kind && item.id === id),
        );
      })
      .catch(() => {
        if (active) setFollowing(false);
      });
    return () => {
      active = false;
    };
  }, [kind, id]);

  async function toggleFollow() {
    if (busy || following === null) {
      return;
    }
    setBusy(true);
    const method = following ? "DELETE" : "POST";
    try {
      const response = await fetch("/api/follows", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, id }),
      });
      if (response.ok) {
        setFollowing(!following);
      } else if (response.status === 401) {
        window.location.assign("/auth");
      }
    } catch {
      // Leave the state unchanged on failure.
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const compareType = kind === "player" ? "players" : "teams";
  const askQuestion =
    kind === "player"
      ? `How many goals did ${name} score in the 2022 World Cup?`
      : `How many goals did ${name} score in the 2022 World Cup?`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Button
          variant={following ? "secondary" : "primary"}
          size="md"
          onClick={toggleFollow}
          disabled={busy || following === null}
        >
          {following === null
            ? "Follow"
            : following
              ? "Following"
              : "Follow"}
        </Button>
        <Link
          href={`/compare?competition=${encodeURIComponent(competitionId)}&type=${compareType}&a=${encodeURIComponent(id)}`}
          className="md-btn md-btn--secondary md-btn--md"
        >
          Compare
        </Link>
        <Button variant="ghost" size="md" onClick={copyLink}>
          {copied ? "Link copied" : "Share"}
        </Button>
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Link href={`/ask?q=${encodeURIComponent(askQuestion)}`} className="md-chip">
          {askQuestion}
        </Link>
      </div>
    </div>
  );
}
