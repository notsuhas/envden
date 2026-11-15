import { expect, test } from "bun:test";
import { syncText } from "../sync.ts";

for (const [direction, changed, conflicts, expected] of [
  ["push", 1, 0, /^Pushed 1 file$/],
  ["push", 0, 0, /^Nothing to push$/],
  ["pull", 3, 0, /^Pulled 3 files$/],
  ["pull", 0, 0, /^Up to date$/],
  ["pull", 0, 2, /^2 conflicts .*nothing pulled$/],
  ["pull", 1, 1, /^Pulled 1 file; 1 conflict /],
] as const)
  test(`${direction} ${changed} changed, ${conflicts} conflicts reads ${expected}`, () => {
    expect(syncText(direction, { changed, conflicts })).toMatch(expected);
  });
