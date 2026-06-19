import assert from "node:assert/strict";
import test from "node:test";

const runAgentTests = process.env.RUN_AGENT_TESTS === "1";

test(
  "answers a known question end to end",
  {
    skip: runAgentTests
      ? false
      : "Set RUN_AGENT_TESTS=1 with a live database and Anthropic key.",
    timeout: 60_000,
  },
  async () => {
    const { answerQuestionWithExplanation } =
      await import("@/lib/agent/answer-query");
    const { guardSql } = await import("@/lib/sql/guard");
    const result = await answerQuestionWithExplanation(
      "Which player had the highest total expected threat in the 2022 World Cup?",
    );

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    assert.equal(guardSql(result.executedSql).ok, true);
    assert.ok(result.answer.length > 0);
    assert.ok(result.columns.length > 0);
    assert.ok(result.rows.length > 0);
  },
);
