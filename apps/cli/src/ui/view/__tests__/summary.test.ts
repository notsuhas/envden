import { expect, test } from "bun:test";
import { syncSummary } from "../summary.ts";

for (const [kind, changed, conflicts, expected] of [
  ["pull", 0, 0, "Pulled: 0 changed, 0 conflicts."],
  ["push", 3, 1, "Pushed: 3 changed, 1 conflict."],
  ["pull", 1, 2, "Pulled: 1 changed, 2 conflicts."],
] as const)
  test(expected, () => {
    expect(syncSummary(kind, changed, conflicts)).toBe(expected);
  });
