"use client";

import { Fragment, useId, useState, type ReactNode } from "react";

import { Badge } from "./badge";

// The Grounded "show the work" component, the signature trust pattern. Collapsed by
// default it shows the Volt GROUNDED check and a "show the work" affordance, or the
// amber caution state when a number could not be traced. Expanding reveals the real
// executedSql in mono with light syntax tinting and the returned rows. It binds to
// the Ask API response and shows only real data: the numbers in the answer come from
// these rows, never from the model. The SQL stays English even when the answer is
// translated, because a query is language independent.

type Grounding = {
  grounded: boolean;
  ungroundedNumbers: string[];
};

export function Grounded({
  executedSql,
  columns,
  rows,
  rowCount,
  grounding,
  isPrediction = false,
}: {
  executedSql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  grounding: Grounding;
  isPrediction?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const grounded = grounding.grounded;
  const untraced = grounding.ungroundedNumbers ?? [];

  return (
    <section
      className={`md-grounded ${grounded ? "" : "md-grounded--caution"}`}
    >
      <button
        type="button"
        className="md-grounded-summary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          {grounded ? (
            <Badge kind="grounded" />
          ) : (
            <span className="md-badge md-badge--entertainment">
              {"!"} Check
            </span>
          )}
          {isPrediction ? <Badge kind="entertainment" /> : null}
          <span>
            {grounded
              ? `${rowCount} ${rowCount === 1 ? "row" : "rows"}, every number traces to the result`
              : `${untraced.length} untraced ${untraced.length === 1 ? "figure" : "figures"}`}
          </span>
        </span>
        <span className="md-grounded-affordance" aria-hidden>
          {open ? "hide the work ▴" : grounded ? "show the work ▾" : "review ▾"}
        </span>
      </button>

      <div id={panelId} hidden={!open}>
        <div className="md-grounded-body">
          {isPrediction ? (
            <p
              className="md-small"
              style={{ color: "var(--md-amber)", margin: 0 }}
            >
              Model estimate, not betting advice.
            </p>
          ) : null}

          {!grounded && untraced.length > 0 ? (
            <div>
              <p
                className="md-small"
                style={{ color: "var(--md-amber)", margin: "0 0 var(--space-2)" }}
              >
                These figures are not in the query result, so treat them with care:
              </p>
              <ul className="md-caution-list">
                {untraced.map((figure) => (
                  <li key={figure} className="md-ltr md-tnum">
                    {figure}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <span
              className="md-overline"
              style={{ color: "var(--md-text-lo)", display: "block", marginBottom: "var(--space-2)" }}
            >
              The query
            </span>
            <pre className="md-sql md-ltr">
              <code>{tintSql(executedSql)}</code>
            </pre>
          </div>

          {rows.length > 0 && columns.length > 0 ? (
            <div>
              <span
                className="md-overline"
                style={{ color: "var(--md-text-lo)", display: "block", marginBottom: "var(--space-2)" }}
              >
                The rows
              </span>
              <div style={{ overflowX: "auto" }}>
                <table className="md-rows">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {columns.map((column) => (
                          <td key={column} className="md-ltr">
                            {formatCell(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {grounded ? (
                <p
                  className="md-small"
                  style={{ color: "var(--md-volt)", marginTop: "var(--space-3)" }}
                >
                  {"✓"} {rowCount} {rowCount === 1 ? "row" : "rows"}, every number
                  traces to the result.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

// Light syntax tinting for the SQL proof. Keywords go Volt, numbers amber, strings
// mint. This is presentation only; the SQL text itself is shown verbatim.
const SQL_KEYWORDS = new Set([
  "select", "from", "where", "join", "inner", "left", "right", "outer", "full",
  "on", "group", "by", "order", "having", "limit", "offset", "and", "or", "not",
  "as", "asc", "desc", "distinct", "in", "is", "null", "true", "false", "case",
  "when", "then", "else", "end", "sum", "count", "avg", "max", "min", "coalesce",
  "with", "union", "all", "between", "like", "exists",
]);

function tintSql(sql: string): ReactNode[] {
  const tokens = sql.match(/'[^']*'|\b\d+\.?\d*\b|\w+|[^\w'\s]+|\s+/g) ?? [sql];
  return tokens.map((token, index) => {
    const key = `${index}-${token}`;
    if (/^'.*'$/.test(token)) {
      return (
        <span className="str" key={key}>
          {token}
        </span>
      );
    }
    if (/^\d/.test(token)) {
      return (
        <span className="num" key={key}>
          {token}
        </span>
      );
    }
    if (SQL_KEYWORDS.has(token.toLowerCase())) {
      return (
        <span className="kw" key={key}>
          {token}
        </span>
      );
    }
    return <Fragment key={key}>{token}</Fragment>;
  });
}
