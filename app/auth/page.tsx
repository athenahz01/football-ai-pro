"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Mode = "sign-in" | "sign-up";

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
    <main style={styles.main}>
      <h1 style={styles.title}>
        {mode === "sign-in" ? "Sign in" : "Create an account"}
      </h1>
      <p style={styles.subtitle}>
        You can use Football AI Pro without an account. Signing in gives you a
        higher request limit and, soon, personalized following.
      </p>

      <form style={styles.form} onSubmit={submit}>
        <input
          style={styles.input}
          type="email"
          autoComplete="email"
          required
          value={email}
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          style={styles.input}
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          placeholder="Password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <button style={styles.button} type="submit" disabled={loading}>
          {loading
            ? "Working"
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      {error !== null ? <p style={styles.error}>{error}</p> : null}
      {notice !== null ? <p style={styles.notice}>{notice}</p> : null}

      <button
        type="button"
        style={styles.switch}
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

      <p style={styles.back}>
        <Link href="/ask" style={styles.link}>
          Back to asking questions
        </Link>
      </p>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: "420px",
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily: "system-ui, sans-serif",
    color: "#111",
  },
  title: { fontSize: "28px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { color: "#555", marginBottom: "24px", lineHeight: 1.5 },
  form: { display: "flex", flexDirection: "column", gap: "10px" },
  input: {
    padding: "12px 14px",
    fontSize: "15px",
    border: "1px solid #ccc",
    borderRadius: "8px",
  },
  button: {
    padding: "12px 20px",
    fontSize: "15px",
    fontWeight: 600,
    color: "#fff",
    background: "#111",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  error: { color: "#b00020", marginTop: "12px" },
  notice: { color: "#1a7f37", marginTop: "12px", lineHeight: 1.5 },
  switch: {
    marginTop: "16px",
    padding: 0,
    fontSize: "14px",
    color: "#333",
    background: "none",
    border: "none",
    cursor: "pointer",
    textDecoration: "underline",
  },
  back: { marginTop: "24px", fontSize: "14px" },
  link: { color: "#333" },
};
