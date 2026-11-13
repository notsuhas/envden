import { test, expect } from "bun:test";
import { deriveAlias } from "../alias.ts";
import { isWithinRoot } from "../discovery.ts";

for (const [source, target, aliases, kind] of [
  ["", "b", {}, "invalid"],
  ["a", "", {}, "invalid"],
  ["a", "a", {}, "invalid"],
  ["a", "b", { b: "c" }, "chain"],
  ["a", "b", { c: "a" }, "chain"],
  ["a", "b", {}, "assign"],
] satisfies [string, string, Record<string, string>, string][])
  test(`alias ${source} ${target} ${JSON.stringify(aliases)}`, () => {
    expect(String(deriveAlias(aliases, source, target).kind)).toBe(kind);
  });

for (const [path, expected] of [
  ["/repos", true],
  ["/repos/a", true],
  ["/repos-other", false],
  ["/elsewhere", false],
] as const)
  test(`excluded root ${path}`, () => {
    expect(isWithinRoot("/repos", path)).toBe(expected);
  });
