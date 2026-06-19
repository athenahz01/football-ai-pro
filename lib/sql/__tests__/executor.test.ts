import assert from "node:assert/strict";
import test from "node:test";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";

test(
  "read only transaction rejects an unchecked write",
  {
    skip: runDatabaseTests
      ? false
      : "Set RUN_DB_TESTS=1 to run against a live database.",
  },
  async () => {
    const { executeSqlInReadOnlyTransaction } =
      await import("@/lib/sql/executor");
    const result = await executeSqlInReadOnlyTransaction(
      "create temporary table sql_guard_write_probe(id integer)",
      1,
      1_000,
    );

    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.message, /read-only|read only/i);
  },
);
