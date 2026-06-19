import assert from "node:assert/strict";
import test from "node:test";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";

test(
  "known glossary term retrieves itself from pgvector",
  {
    skip: runDatabaseTests
      ? false
      : "Set RUN_DB_TESTS=1 after seeding glossary_terms to run against a live database.",
  },
  async () => {
    const { retrieveGlossary } = await import("@/lib/retrieval/glossary");
    const hits = await retrieveGlossary("expected goals xG shot_xg.xg", {
      topK: 1,
    });

    assert.equal(hits.length, 1);
    assert.equal(hits[0].term, "expected goals");
  },
);
