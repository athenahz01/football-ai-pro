"use client";

import { useState } from "react";

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

const SAMPLE_QUESTIONS = [
  "Which player scored the most goals in the 2022 World Cup?",
  "Which team had the highest total expected goals?",
  "Who attempted the most shots, and how many?",
];

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
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
        body: JSON.stringify({ question: trimmed }),
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

  return (
    <main style={styles.main}>
      <AuthStatus />
      <h1 style={styles.title}>Football AI Pro</h1>
      <p style={styles.subtitle}>
        Ask a question about the 2022 World Cup. Every answer is grounded in a
        real query against the database.
      </p>

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
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? "Thinking" : "Ask"}
        </button>
      </form>

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

          {result.executedSql ?? result.generatedSql ? (
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

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily: "system-ui, sans-serif",
    color: "#111",
  },
  title: { fontSize: "28px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { color: "#555", marginBottom: "24px", lineHeight: 1.5 },
  form: { display: "flex", gap: "8px", marginBottom: "16px" },
  input: {
    flex: 1,
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
  samples: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "24px" },
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
