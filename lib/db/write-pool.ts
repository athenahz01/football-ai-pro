import "server-only";

import { Pool, type QueryResult, type QueryResultRow } from "pg";

import { config } from "@/lib/config/env";

// Trusted, parameterized, server only write path for the app's own
// infrastructure tables: the semantic answer cache and the rate limiter.
//
// This is deliberately separate from the read only model path. Model written SQL
// runs only through guardSql and executeReadOnlySql, which open a read only
// transaction. This pool runs ordinary read write transactions, so it must never
// be handed a string that the language model produced. Every caller here passes a
// fixed SQL statement with bound parameters. No model output is ever interpolated
// into these statements.

let writePool: Pool | undefined;

function getWritePool(): Pool {
  writePool ??= new Pool({
    connectionString: config.supabaseDbUrl,
    max: 5,
  });

  return writePool;
}

export async function executeTrustedWrite<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  const client = await getWritePool().connect();

  try {
    return await client.query<T>(text, values);
  } finally {
    client.release();
  }
}
