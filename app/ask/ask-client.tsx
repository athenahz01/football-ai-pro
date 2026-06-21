"use client";

import { useState } from "react";

import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "@/lib/i18n/languages";
import type { PublicBillingState } from "@/lib/billing/types";

import { AskInput } from "@/components/matchday/ask-input";
import { Chip } from "@/components/matchday/chip";
import { Button } from "@/components/matchday/button";
import { PanelCard } from "@/components/matchday/cards";
import { Badge } from "@/components/matchday/badge";
import { Grounded } from "@/components/matchday/grounded";
import { HeadlineStat } from "@/components/matchday/dataviz/headline-stat";
import {
  Leaderboard,
  type LeaderboardItem,
} from "@/components/matchday/dataviz/leaderboard";

// The answer experience, rebuilt in MATCHDAY. The wiring is unchanged: it posts the
// question to /api/ask and renders whatever the grounded pipeline returns. The design
// leads with the entity and the big number, renders the rows as bars, and attaches
// the Grounded component to every answer that carries a number. Numbers shown come
// only from the returned rows, never from the model.

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

  const viz = result ? deriveViz(result) : null;
  const sql = result?.executedSql ?? result?.generatedSql ?? "";
  const isPrediction = usedPredictions(result);
  const hasProof =
    result !== null &&
    sql.length > 0 &&
    (result.rows?.length ?? 0) > 0 &&
    (result.columns?.length ?? 0) > 0;

  return (
    <main className="md-screen">
      <div className="md-container md-answer">
        <header>
          <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
            Ask football anything
          </span>
          <h1 className="md-display-3" style={{ marginTop: "var(--space-2)" }}>
            Every answer, grounded.
          </h1>
        </header>

        <BillingPanel
          billing={billing}
          loading={billingLoading}
          error={billingError}
          onCheckout={() => startBilling("/api/billing/checkout", "checkout")}
          onPortal={() => startBilling("/api/billing/portal", "portal")}
        />

        <div className="md-answer-ask">
          <AskInput
            value={question}
            onChange={setQuestion}
            onSubmit={() => ask(question)}
            thinking={loading}
            placeholder="Which player had the highest total expected threat?"
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
              marginTop: "var(--space-3)",
            }}
          >
            <label
              className="md-small"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                color: "var(--md-text-lo)",
              }}
            >
              Answer language
              <select
                className="md-select"
                value={language}
                aria-label="Answer language"
                onChange={(event) =>
                  setLanguage(event.target.value as LanguageCode)
                }
              >
                {SUPPORTED_LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="md-small" style={{ color: "var(--md-text-lo)" }}>
              The numbers are the same in every language.
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-2)",
              marginTop: "var(--space-4)",
            }}
          >
            {SAMPLE_QUESTIONS.map((sample) => (
              <Chip
                key={sample}
                onClick={() => {
                  setQuestion(sample);
                  ask(sample);
                }}
              >
                {sample}
              </Chip>
            ))}
          </div>
        </div>

        {error !== null ? (
          <p className="md-body" style={{ color: "var(--md-down)" }}>
            {error}
          </p>
        ) : null}

        {result !== null ? (
          <section className="md-answer-grid">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-5)",
              }}
            >
              {isPrediction ? (
                <PanelCard
                  style={{ borderColor: "rgba(255,194,59,0.4)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    <Badge kind="entertainment" />
                  </div>
                  <p
                    className="md-small"
                    style={{ color: "var(--md-text-mid)", margin: 0 }}
                  >
                    Predictions are model estimates for entertainment, not betting
                    advice. They are trained on a single tournament so far, so treat
                    them as a rough guide, not a confident call.
                  </p>
                </PanelCard>
              ) : null}

              {viz?.headline ? (
                <HeadlineStat
                  entity={viz.headline.entity}
                  value={viz.headline.value}
                  context={viz.headline.context}
                />
              ) : null}

              {result.answer ? (
                <p
                  className="md-body"
                  style={{ color: "var(--md-text-mid)", fontSize: "16px" }}
                >
                  {result.answer}
                </p>
              ) : null}

              {viz && viz.items.length > 1 ? (
                <PanelCard>
                  <span
                    className="md-overline"
                    style={{
                      color: "var(--md-text-lo)",
                      display: "block",
                      marginBottom: "var(--space-3)",
                    }}
                  >
                    {viz.contextLabel}
                  </span>
                  <Leaderboard items={viz.items} />
                </PanelCard>
              ) : null}

              {result.truncated ? (
                <p className="md-small" style={{ color: "var(--md-text-lo)" }}>
                  Showing the first rows of a larger result.
                </p>
              ) : null}
            </div>

            <div>
              {hasProof && result.grounding ? (
                <Grounded
                  executedSql={sql}
                  columns={result.columns ?? []}
                  rows={result.rows ?? []}
                  rowCount={result.rowCount ?? result.rows?.length ?? 0}
                  grounding={result.grounding}
                  isPrediction={isPrediction}
                />
              ) : result.grounding && !result.grounding.grounded ? (
                <Grounded
                  executedSql={sql}
                  columns={result.columns ?? []}
                  rows={result.rows ?? []}
                  rowCount={result.rowCount ?? 0}
                  grounding={result.grounding}
                  isPrediction={isPrediction}
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
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
      <PanelCard>
        <div className="md-billing-row">
          <p className="md-small" style={{ color: "var(--md-text-mid)", margin: 0 }}>
            Sign in to keep a higher request limit on your account.
          </p>
          <a href="/auth" className="md-btn md-btn--secondary md-btn--sm">
            Sign in
          </a>
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard>
      <div className="md-billing-row">
        <div>
          <span
            className="md-overline"
            style={{
              color:
                billing.tier === "premium"
                  ? "var(--md-volt)"
                  : "var(--md-text-lo)",
            }}
          >
            {billing.tier === "premium" ? "Premium" : "Free"}
          </span>
          <p
            className="md-small"
            style={{ color: "var(--md-text-mid)", margin: "var(--space-1) 0 0" }}
          >
            {billing.tier === "premium"
              ? "Premium is active with a higher request limit."
              : "Upgrade for a higher signed in request limit."}
          </p>
          {billing.currentPeriodEnd ? (
            <p
              className="md-small"
              style={{ color: "var(--md-text-lo)", margin: "var(--space-1) 0 0" }}
            >
              Current period ends {formatDate(billing.currentPeriodEnd)}.
            </p>
          ) : null}
          {error !== null ? (
            <p
              className="md-small"
              style={{ color: "var(--md-down)", margin: "var(--space-2) 0 0" }}
            >
              {error}
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {billing.tier === "premium" || billing.canManageBilling ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={loading !== null}
              onClick={onPortal}
            >
              {loading === "portal" ? "Opening" : "Manage"}
            </Button>
          ) : null}
          {billing.tier !== "premium" ? (
            <Button
              variant="primary"
              size="sm"
              disabled={loading !== null}
              onClick={onCheckout}
            >
              {loading === "checkout" ? "Opening" : "Upgrade"}
            </Button>
          ) : null}
        </div>
      </div>
    </PanelCard>
  );
}

type Viz = {
  headline: { entity: string; value: string; context: string } | null;
  items: LeaderboardItem[];
  contextLabel: string;
};

// Derive the headline number and the bars from the returned rows. The label column is
// the first non numeric column, the value column the first numeric one. This only
// presents real row values; it never invents a number.
function deriveViz(result: AskResponse): Viz | null {
  const columns = result.columns ?? [];
  const rows = result.rows ?? [];
  if (columns.length === 0 || rows.length === 0) {
    return null;
  }

  const numericCol = columns.find((column) => isNumeric(rows[0][column]));
  if (numericCol === undefined) {
    return null;
  }

  const labelCol =
    columns.find(
      (column) => column !== numericCol && !isNumeric(rows[0][column]),
    ) ?? columns.find((column) => column !== numericCol);

  const contextLabel = humanizeColumn(numericCol);

  const items: LeaderboardItem[] = labelCol
    ? rows.map((row) => ({
        label: String(row[labelCol] ?? ""),
        value: toNumber(row[numericCol]) ?? 0,
        display: formatNumber(row[numericCol]),
      }))
    : [];

  const headline = {
    entity: labelCol ? String(rows[0][labelCol] ?? "") : "",
    value: formatNumber(rows[0][numericCol]),
    context: contextLabel,
  };

  return { headline, items, contextLabel };
}

function isNumeric(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return Number.isFinite(Number(value));
  }
  return false;
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return String(value ?? "");
  }
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(parsed);
}

const ACRONYMS: Record<string, string> = {
  xg: "xG",
  xt: "xT",
  vaep: "VAEP",
};

function humanizeColumn(column: string): string {
  return column
    .split("_")
    .map((part) => ACRONYMS[part.toLowerCase()] ?? part)
    .join(" ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

// Show the entertainment framing when an answer was built from the prediction tables,
// mirroring the language the schema already carries.
function usedPredictions(result: AskResponse | null): boolean {
  if (result === null) {
    return false;
  }
  const sql = `${result.executedSql ?? ""} ${result.generatedSql ?? ""}`;
  return /match_predictions|team_ratings/i.test(sql);
}
