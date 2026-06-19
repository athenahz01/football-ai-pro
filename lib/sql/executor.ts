import "server-only";

import { Pool } from "pg";

import { config } from "@/lib/config/env";
import { guardSql } from "@/lib/sql/guard";
import {
  DEFAULT_SQL_STATEMENT_TIMEOUT_MS,
  type SqlExecutionError,
  type SqlExecutionResult,
  type SqlExecutionSuccess,
  type SqlGuardAccepted,
  type SqlValue,
} from "@/lib/sql/types";

type ExecutorOptions = {
  maxRows?: number;
  statementTimeoutMs?: number;
};

let pool: Pool | undefined;

export async function executeReadOnlySql(
  sql: string,
  options: ExecutorOptions = {},
): Promise<SqlExecutionResult> {
  const guarded = guardSql(sql, { maxRows: options.maxRows });

  if (!guarded.ok) {
    return {
      ok: false,
      message: guarded.reason,
    };
  }

  return executeGuardedSql(guarded, options);
}

export async function executeGuardedSql(
  guarded: SqlGuardAccepted,
  options: ExecutorOptions = {},
): Promise<SqlExecutionResult> {
  return executeSqlInReadOnlyTransaction(
    guarded.sql,
    guarded.rowLimit,
    options.statementTimeoutMs ?? DEFAULT_SQL_STATEMENT_TIMEOUT_MS,
  );
}

export async function executeSqlInReadOnlyTransaction(
  sql: string,
  rowLimit: number,
  statementTimeoutMs = DEFAULT_SQL_STATEMENT_TIMEOUT_MS,
  values: unknown[] = [],
): Promise<SqlExecutionResult> {
  const client = await getPool().connect();

  try {
    await client.query("begin transaction read only");
    await client.query("select set_config('statement_timeout', $1, true)", [
      `${statementTimeoutMs}ms`,
    ]);

    const result = await client.query<Record<string, SqlValue>>(sql, values);
    await client.query("rollback");

    return {
      ok: true,
      sql,
      columns: result.fields.map((field) => field.name),
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      truncated: result.rows.length >= rowLimit,
    } satisfies SqlExecutionSuccess;
  } catch (error) {
    await rollbackQuietly(client);
    return toExecutionError(sql, error);
  } finally {
    client.release();
  }
}

function getPool(): Pool {
  pool ??= new Pool({
    connectionString: config.supabaseDbUrl,
  });

  return pool;
}

async function rollbackQuietly(client: {
  query: (sql: string) => Promise<unknown>;
}) {
  try {
    await client.query("rollback");
  } catch {
    return;
  }
}

function toExecutionError(sql: string, error: unknown): SqlExecutionError {
  const message =
    error instanceof Error ? error.message : "Unknown database error.";

  return {
    ok: false,
    sql,
    message: `Database rejected the query. ${message}`,
  };
}
