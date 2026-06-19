import assert from "node:assert/strict";
import test from "node:test";

import { verifyGrounding } from "@/lib/agent/verify-grounding";

test("does not flag a number that appears in the rows", () => {
  const result = verifyGrounding("The player had 7 shots.", [
    {
      player_name: "Example Player",
      shots: 7,
    },
  ]);

  assert.equal(result.grounded, true);
  assert.deepEqual(result.ungroundedNumbers, []);
});

test("flags a number that does not appear in the rows", () => {
  const result = verifyGrounding("The player had 9 shots.", [
    {
      player_name: "Example Player",
      shots: 7,
    },
  ]);

  assert.equal(result.grounded, false);
  assert.deepEqual(result.ungroundedNumbers, ["9"]);
});
