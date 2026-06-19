import { Parser } from "node-sql-parser";

import {
  DEFAULT_SQL_ROW_LIMIT,
  type SqlGuardResult,
  type SqlRejectionCode,
} from "@/lib/sql/types";

type SqlAst = {
  type?: string;
  with?: Array<{ stmt?: SqlAst }>;
  into?: { position?: string | null } | null;
  limit?: {
    seperator?: string;
    value?: Array<{ type?: string; value?: number | string }>;
  };
};

type GuardOptions = {
  maxRows?: number;
};

const parser = new Parser();

const FORBIDDEN_STATEMENT_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "merge",
  "truncate",
  "drop",
  "alter",
  "create",
  "grant",
  "revoke",
  "copy",
  "call",
  "execute",
  "vacuum",
  "analyze",
  "refresh",
  "comment",
  "listen",
  "notify",
] as const;

const FORBIDDEN_SELECT_PATTERNS = [
  /\bfor\s+update\b/i,
  /\bfor\s+share\b/i,
  /\bselect\b[\s\S]*\binto\s+(?:temp|temporary|unlogged|table)?\s*[A-Za-z_]/i,
];

export function guardSql(
  sql: string,
  options: GuardOptions = {},
): SqlGuardResult {
  const trimmedSql = sql.trim();
  const maxRows = options.maxRows ?? DEFAULT_SQL_ROW_LIMIT;

  if (trimmedSql.length === 0) {
    return reject("empty_sql", "SQL is empty.");
  }

  let parsed: SqlAst | SqlAst[];

  try {
    parsed = parser.astify(trimmedSql, { database: "Postgresql" }) as
      | SqlAst
      | SqlAst[];
  } catch {
    const forbiddenKeyword = findForbiddenKeyword(trimmedSql);

    if (forbiddenKeyword !== null) {
      return reject(
        "write_or_ddl",
        `${forbiddenKeyword.toUpperCase()} statements are not allowed.`,
      );
    }

    if (hasForbiddenSelectPattern(trimmedSql)) {
      return reject(
        "unsafe_select",
        "Row locking or SELECT INTO is not allowed.",
      );
    }

    return reject(
      "parse_error",
      "SQL could not be parsed as a single Postgres SELECT query.",
    );
  }

  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) {
      return reject(
        "multiple_statements",
        "Only one SQL statement is allowed.",
      );
    }

    parsed = parsed[0];
  }

  const validation = validateReadOnlySelect(parsed);
  if (!validation.ok) {
    return validation;
  }

  if (hasForbiddenSelectPattern(trimmedSql)) {
    return reject(
      "unsafe_select",
      "Row locking or SELECT INTO is not allowed.",
    );
  }

  const rowLimit = applyLimit(parsed, maxRows);

  try {
    return {
      ok: true,
      sql: parser.sqlify(parsed as never, { database: "Postgresql" }),
      rowLimit,
    };
  } catch {
    return reject("parse_error", "Safe SQL could not be generated.");
  }
}

function validateReadOnlySelect(ast: SqlAst): SqlGuardResult {
  if (ast.type !== "select") {
    const statementType = ast.type?.toUpperCase() ?? "UNKNOWN";
    return reject(
      "not_select",
      `${statementType} statements are not allowed. Only SELECT queries are allowed.`,
    );
  }

  if (ast.into?.position !== null && ast.into?.position !== undefined) {
    return reject("unsafe_select", "SELECT INTO is not allowed.");
  }

  for (const cte of ast.with ?? []) {
    const cteStatement = cte.stmt;

    if (cteStatement === undefined) {
      return reject("cte_write", "CTE could not be validated as read only.");
    }

    if (cteStatement.type !== "select") {
      const statementType = cteStatement.type?.toUpperCase() ?? "UNKNOWN";
      return reject(
        "cte_write",
        `CTE contains ${statementType}, but only SELECT CTEs are allowed.`,
      );
    }

    const nestedValidation = validateReadOnlySelect(cteStatement);
    if (!nestedValidation.ok) {
      return nestedValidation.code === "not_select"
        ? reject("cte_write", nestedValidation.reason)
        : nestedValidation;
    }
  }

  return {
    ok: true,
    sql: "",
    rowLimit: DEFAULT_SQL_ROW_LIMIT,
  };
}

function applyLimit(ast: SqlAst, maxRows: number): number {
  const existingLimit = readNumericLimit(ast.limit);
  const rowLimit =
    existingLimit === null ? maxRows : Math.min(existingLimit, maxRows);

  ast.limit = {
    seperator: ast.limit?.seperator ?? "",
    value: [
      {
        type: "number",
        value: rowLimit,
      },
      ...(ast.limit?.seperator === "offset" &&
      ast.limit.value?.[1] !== undefined
        ? [ast.limit.value[1]]
        : []),
    ],
  };

  return rowLimit;
}

function readNumericLimit(limit: SqlAst["limit"]): number | null {
  const value = limit?.value?.[0];

  if (value?.type !== "number") {
    return null;
  }

  const numericValue =
    typeof value.value === "number" ? value.value : Number(value.value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  return Math.floor(numericValue);
}

function findForbiddenKeyword(sql: string): string | null {
  return (
    FORBIDDEN_STATEMENT_KEYWORDS.find((keyword) =>
      new RegExp(`\\b${keyword}\\b`, "i").test(sql),
    ) ?? null
  );
}

function hasForbiddenSelectPattern(sql: string): boolean {
  return FORBIDDEN_SELECT_PATTERNS.some((pattern) => pattern.test(sql));
}

function reject(code: SqlRejectionCode, reason: string): SqlGuardResult {
  return {
    ok: false,
    code,
    reason,
  };
}
