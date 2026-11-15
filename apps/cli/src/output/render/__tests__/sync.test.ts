import { expect, test } from "bun:test";
import { syncText } from "../sync.ts";

for (const [direction, changed, conflicts, expected] of [
  ["push", 1, 0, "Pushed 1 file"],
  ["push", 0, 0, "Nothing to push"],
  ["pull", 3, 0, "Pulled 3 files"],
  ["pull", 0, 0, "Up to date"],
  ["pull", 0, 2, "Up to date; 2 conflicts"],
  ["push", 2, 1, "Pushed 2 files; 1 conflict"],
] as const)
  test(`${direction} summary: ${expected}`, () => {
    expect(syncText(direction, { changed, conflicts })).toBe(expected);
  });
