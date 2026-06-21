"use client";

import Link from "next/link";
import { useState } from "react";

import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "@/lib/i18n/languages";
import type { PublicBillingState } from "@/lib/billing/types";

import { AuthStatus } from "./auth-status";

type GroundingInfo = {
  grounded: boolean;
  ungroundedNumbers: string[];
};

type AskResponse = {
  answer?: string;
  generatedSql?: string;
  executedSql?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
  grounding?: GroundingInfo;
  error?: string;
};

type BillingActionResponse = {
  url?: string;
  error?: string;
};

const SAMPLE_QUESTIONS = [
  "Which player scored the most goals in the 2022 World Cup?",
  "Which team had the highest total expected goals?",
  "Who attempted the most shots, and how many?",
];

export function AskClient({
  initialQuestion,
  billing,
}: {
  initialQuestion: string;
  billing: PublicBillingState;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [loading, setLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState<
    "checkout" | "portal" | null
  >(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(currentQuestion: string) {
    const trimmed = currentQuestion.trim();
    if (trimmed.length === 0 || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, language }),
      });
      const data: AskResponse = await response.json();
      setResult(data);
      if (!response.ok && data.error) {
        setError(data.error);
      }
    } catch {
      setError("The request failed. Check that the dev server is running.");
    } finally {
      setLoading(false);
    }
  }

  async function startBilling(path: string, action: "checkout" | "portal") {
    if (billingLoading !== null) {
      return;
    }

    setBillingLoading(action);
    setBillingError(null);

    try {
      const response = await fetch(path, { method: "POST" });
      const data: BillingActionResponse = await response.json();

      if (!response.ok || !data.url) {
        setBillingError(data.error ?? "Billing could not be opened.");
        return;
      }

      window.location.assign(data.url);
    } catch {
      setBillingError("Billing could not be opened.");
    } finally {
      setBillingLoading(null);
    }
  }

  return (
    <main style={styles.main}>
      <AuthStatus />
      <nav style={styles.nav}>
        <Link href="/compare" style={styles.navLink}>
          Compare
        </Link>
        <Link href="/scout" style={styles.navLink}>
          Scout
        </Link>
        <Link href="/replay" style={styles.navLink}>
          Replay
        </Link>
        <Link href="/community" style={styles.navLink}>
          Community
        </Link>
      </nav>
      <h1 style={styles.title}>Football AI Pro</h1>
      <p style={styles.subtitle}>
        Ask a question about the 2022 World Cup. Every answer is grounded in a
        real query against the database.
      </p>
      <BillingPanel
        billing={billing}
        loading={billingLoading}
        error={billingError}
        onCheckout={() => startBilling("/api/billing/checkout", "checkout")}
        onPortal={() => startBilling("/api/billing/portal", "portal")}
      />

      <form
        style={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <input
          style={styles.input}
          value={question}
          placeholder="Which player had the highest total expected threat?"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <select
          style={styles.language}
          value={language}
          aria-label="Answer language"
          onChange={(event) => setLanguage(event.target.value as LanguageCode)}
        >
          {SUPPORTED_LANGUAGES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? "Thinking" : "Ask"}
        </button>
      </form>
      <p style={styles.languageHint}>
        The answer is written in the language you choose. The numbers are the
        same in every language.
      </p>

      <div style={styles.samples}>
        {SAMPLE_QUESTIONS.map((sample) => (
          <button
            key={sample}
            style={styles.sampleButton}
            type="button"
            onClick={() => {
              setQuestion(sample);
              ask(sample);
            }}
          >
            {sample}
          </button>
        ))}
      </div>

      {error !== null ? <p style={styles.error}>{error}</p> : null}

      {result !== null ? (
        <section style={styles.result}>
          {usedPredictions(result) ? (
            <p style={styles.disclaimer}>
              Heads up: predictions are model estimates for entertainment, not
              betting advice. They are trained on a single tournament so far, so
              treat them as a rough guide, not a confident call.
            </p>
          ) : null}
          {result.answer ? <p style={styles.answer}>{result.answer}</p> : null}

          {result.grounding ? (
            <p style={styles.grounding}>
              {result.grounding.grounded
                ? "Grounded: every number traces to the query result."
                : `Check: numbers not traced to the result: ${result.grounding.ungroundedNumbers.join(
                    ", ",
                  )}`}
            </p>
          ) : null}

          {(result.executedSql ?? result.generatedSql) ? (
            <details style={styles.details}>
              <summary>Show the SQL that produced this answer</summary>
              <pre style={styles.pre}>
                {result.executedSql ?? result.generatedSql}
              </pre>
            </details>
          ) : null}

          {result.rows && result.rows.length > 0 && result.columns ? (
            <ResultTable columns={result.columns} rows={result.rows} />
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function BillingPanel({
  billing,
  loading,
  error,
  onCheckout,
  onPortal,
}: {
  billing: PublicBillingState;
  loading: "checkout" | "portal" | null;
  error: string | null;
  onCheckout: () => void;
  onPortal: () => void;
}) {
  if (!billing.authenticated) {
    return (
      <section style={styles.billingPanel}>
        <p style={styles.billingText}>
          Sign in to keep a higher request limit on your account.
        </p>
        <Link href="/auth" style={styles.billingLink}>
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section style={styles.billingPanel}>
      <div>
        <strong style={styles.billingTitle}>
          {billing.tier === "premium" ? "Premium" : "Free"}
        </strong>
        <p style={styles.billingText}>
          {billing.tier === "premium"
            ? "Premium is active with a higher request limit."
            : "Upgrade for a higher signed-in request limit."}
        </p>
        {billing.currentPeriodEnd ? (
          <p style={styles.billingMeta}>
            Current period ends {formatDate(billing.currentPeriodEnd)}.
          </p>
        ) : null}
        {error !== null ? <p style={styles.billingError}>{error}</p> : null}
      </div>
      <div style={styles.billingActions}>
        {billing.tier === "premium" || billing.canManageBilling ? (
          <button
            type="button"
            style={styles.secondaryButton}
            disabled={loading !== null}
            onClick={onPortal}
          >
            {loading === "portal" ? "Opening" : "Manage"}
          </button>
        ) : null}
        {billing.tier !== "premium" ? (
          <button
            type="button"
            style={styles.button}
            disabled={loading !== null}
            onClick={onCheckout}
          >
            {loading === "checkout" ? "Opening" : "Upgrade"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ResultTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} style={styles.th}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 50).map((row, rowIndex) => (
          <tr key={rowIndex}>
            {columns.map((column) => (
              <td key={column} style={styles.td}>
                {formatCell(row[column])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

// Show the entertainment framing when an answer was built from the prediction
// tables, mirroring the language the schema already carries.
function usedPredictions(result: AskResponse): boolean {
  const sql = `${result.executedSql ?? ""} ${result.generatedSql ?? ""}`;
  return /match_predictions|team_ratings/i.test(sql);
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily: "system-ui, sans-serif",
    color: "#111",
  },
  nav: { display: "flex", gap: "16px", marginBottom: "12px", fontSize: "14px" },
  navLink: { color: "#333" },
  title: { fontSize: "28px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { color: "#555", marginBottom: "24px", lineHeight: 1.5 },
  billingPanel: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "center",
    border: "1px solid #e2e2e2",
    borderRadius: "8px",
    padding: "12px 14px",
    marginBottom: "20px",
    background: "#fafafa",
  },
  billingTitle: { display: "block", fontSize: "14px", marginBottom: "4px" },
  billingText: { margin: 0, color: "#555", fontSize: "13px", lineHeight: 1.5 },
  billingMeta: {
    margin: "4px 0 0",
    color: "#777",
    fontSize: "12px",
    lineHeight: 1.5,
  },
  billingError: {
    margin: "6px 0 0",
    color: "#b00020",
    fontSize: "12px",
    lineHeight: 1.5,
  },
  billingActions: { display: "flex", gap: "8px", flexWrap: "wrap" },
  billingLink: { color: "#333", fontSize: "13px", fontWeight: 600 },
  form: { display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" },
  input: {
    flex: 1,
    minWidth: "240px",
    padding: "12px 14px",
    fontSize: "15px",
    border: "1px solid #ccc",
    borderRadius: "8px",
  },
  language: {
    padding: "12px 12px",
    fontSize: "15px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "#fff",
  },
  languageHint: { fontSize: "13px", color: "#777", marginBottom: "16px" },
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
  secondaryButton: {
    padding: "12px 20px",
    fontSize: "15px",
    fontWeight: 600,
    color: "#111",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "8px",
    cursor: "pointer",
  },
  samples: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "24px",
  },
  sampleButton: {
    padding: "8px 12px",
    fontSize: "13px",
    color: "#333",
    background: "#f3f3f3",
    border: "1px solid #e2e2e2",
    borderRadius: "999px",
    cursor: "pointer",
  },
  error: { color: "#b00020", marginTop: "8px" },
  result: { marginTop: "24px" },
  disclaimer: {
    fontSize: "13px",
    color: "#8a6d00",
    background: "#fff8e1",
    border: "1px solid #f0e0a0",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "12px",
    lineHeight: 1.5,
  },
  answer: { fontSize: "17px", lineHeight: 1.6, marginBottom: "12px" },
  grounding: { fontSize: "13px", color: "#555", marginBottom: "16px" },
  details: { marginBottom: "16px" },
  pre: {
    whiteSpace: "pre-wrap",
    background: "#f6f8fa",
    padding: "12px",
    borderRadius: "8px",
    fontSize: "13px",
    overflowX: "auto",
  },
  table: { borderCollapse: "collapse", width: "100%", fontSize: "14px" },
  th: {
    textAlign: "left",
    borderBottom: "2px solid #ddd",
    padding: "8px",
    background: "#fafafa",
  },
  td: { borderBottom: "1px solid #eee", padding: "8px" },
};
