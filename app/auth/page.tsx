"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/matchday/button";
import { PanelCard } from "@/components/matchday/cards";

type Mode = "sign-in" | "sign-up";

// Sign in and sign up on the dark MATCHDAY canvas. The auth logic is unchanged; only
// the presentation is restyled. The product still works signed out.

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        router.push("/ask");
        router.refresh();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session === null) {
        setNotice(
          "Check your email to confirm your account, then sign in. If confirmation is off, you can sign in now.",
        );
        setMode("sign-in");
        return;
      }

      router.push("/ask");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "460px" }}>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          MATCHDAY
        </span>
        <h1 className="md-display-3" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
          {mode === "sign-in" ? "Sign in" : "Create an account"}
        </h1>
        <p
          className="md-body"
          style={{ color: "var(--md-text-mid)", marginBottom: "var(--space-6)" }}
        >
          You can use Football AI Pro without an account. Signing in gives you a
          higher request limit and personalized following.
        </p>

        <PanelCard>
          <form
            onSubmit={submit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <label className="md-field" style={{ minWidth: 0 }}>
              Email
              <input
                className="md-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="md-field" style={{ minWidth: 0 }}>
              Password
              <input
                className="md-input"
                type="password"
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                required
                minLength={6}
                value={password}
                placeholder="At least 6 characters"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              glow
              disabled={loading}
              style={{ width: "100%" }}
            >
              {loading
                ? "Working"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          {error !== null ? (
            <p
              className="md-small"
              style={{ color: "var(--md-down)", marginTop: "var(--space-3)" }}
            >
              {error}
            </p>
          ) : null}
          {notice !== null ? (
            <p
              className="md-small"
              style={{ color: "var(--md-up)", marginTop: "var(--space-3)" }}
            >
              {notice}
            </p>
          ) : null}
        </PanelCard>

        <button
          type="button"
          className="md-btn md-btn--ghost md-btn--sm"
          style={{ marginTop: "var(--space-4)" }}
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "sign-in"
            ? "Need an account? Create one"
            : "Already have an account? Sign in"}
        </button>

        <p style={{ marginTop: "var(--space-5)" }}>
          <Link
            href="/ask"
            className="md-small"
            style={{ color: "var(--md-text-mid)" }}
          >
            Back to asking questions
          </Link>
        </p>
      </div>
    </main>
  );
}
