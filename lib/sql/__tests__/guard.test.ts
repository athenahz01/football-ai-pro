import assert from "node:assert/strict";
import test from "node:test";

import { guardSql } from "@/lib/sql/guard";

test("accepts a plain select and applies a limit", () => {
  const result = guardSql("select * from matches", { maxRows: 25 });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.sql : "", /LIMIT 25/);
  assert.equal(result.ok ? result.rowLimit : 0, 25);
});

test("accepts a with select", () => {
  const result = guardSql(
    "with recent_matches as (select match_id from matches limit 5) select * from recent_matches",
    { maxRows: 10 },
  );

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.sql : "", /WITH/);
  assert.match(result.ok ? result.sql : "", /LIMIT 10/);
});

test("clamps an existing limit above the row cap", () => {
  const result = guardSql("select * from matches limit 5000", { maxRows: 100 });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.sql : "", /LIMIT 100/);
  assert.equal(result.ok ? result.rowLimit : 0, 100);
});

test("keeps an existing limit below the row cap", () => {
  const result = guardSql("select * from matches limit 12", { maxRows: 100 });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.sql : "", /LIMIT 12/);
  assert.equal(result.ok ? result.rowLimit : 0, 12);
});

test("rejects multi statement SQL", () => {
  const result = guardSql("select 1; select 2");

  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.code, "multiple_statements");
});

test("rejects write and DDL statement types", () => {
  const rejectedSql = [
    "insert into audit_log(id) values (1)",
    "update matches set venue = venue",
    "delete from matches where match_id = 'x'",
    "merge into matches using teams on false when matched then update set venue = venue",
    "truncate table matches",
    "drop table matches",
    "alter table matches add column unsafe integer",
    "create table unsafe_table(id integer)",
    "grant select on matches to public",
    "revoke select on matches from public",
    "copy matches to stdout",
    "call unsafe_proc()",
  ];

  for (const sql of rejectedSql) {
    const result = guardSql(sql);

    assert.equal(result.ok, false, sql);
  }
});

test("rejects a CTE that performs a write", () => {
  const result = guardSql(
    "with changed as (insert into audit_log(id) values (1) returning id) select * from changed",
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.code, "cte_write");
});

test("rejects row locking selects", () => {
  const result = guardSql("select * from matches for update");

  assert.equal(result.ok, false);
});
