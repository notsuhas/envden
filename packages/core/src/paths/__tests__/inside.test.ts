import { expect, test } from "bun:test";
import { placeInRoot } from "../inside.ts";

for (const [root, target, expected] of [
  ["/repos", "/repos", "root"],
  ["/repos", "/repos/", "root"],
  ["/repos", "/repos/a", "inside"],
  ["/repos", "/repos/..cache", "inside"],
  ["/repos", "/repos/a/../b", "inside"],
  ["/repos", "/", "outside"],
  ["/repos", "/repos-other", "outside"],
  ["/repos", "/repos/../x", "outside"],
] as const)
  test(`${root} holds ${target} as ${expected}`, () => {
    expect(placeInRoot(root, target)).toBe(expected);
  });
