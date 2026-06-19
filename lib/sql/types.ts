export const DEFAULT_SQL_ROW_LIMIT = 1_000;
export const DEFAULT_SQL_STATEMENT_TIMEOUT_MS = 5_000;

export type SqlRejectionCode =
  | "empty_sql"
  | "parse_error"
  | "multiple_statements"
  | "write_or_ddl"
  | "not_select"
  | "cte_write"
  | "unsafe_select";

export type SqlGuardAccepted = {
  ok: true;
  sql: string;
  rowLimit: number;
};

export type SqlGuardRejected = {
  ok: false;
  code: SqlRejectionCode;
  reason: string;
};

export type SqlGuardResult = SqlGuardAccepted | SqlGuardRejected;

export type SqlValue =
  | string
  | number
  | boolean
  | null
  | Date
  | SqlValue[]
  | { [key: string]: SqlValue };

export type SqlExecutionSuccess = {
  ok: true;
  sql: string;
  columns: string[];
  rows: Record<string, SqlValue>[];
  rowCount: number;
  truncated: boolean;
};

export type SqlExecutionError = {
  ok: false;
  sql?: string;
  message: string;
};

export type SqlExecutionResult = SqlExecutionSuccess | SqlExecutionError;
