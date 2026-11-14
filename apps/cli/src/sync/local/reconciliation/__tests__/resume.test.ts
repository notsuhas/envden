import { expect, test } from "bun:test";
import { canResume } from "../operation/guards.ts";

for (const [written, current, expected] of [
  [[false, false], ["old", "old"], true],
  [[true, false], ["next", "old"], true],
  [[true, true], ["next", "next"], true],
  [[true, false], ["old", "old"], false],
  [[false, true], ["next", "old"], false],
  [[false, false], ["edit", "old"], false],
  [[false, false], ["next", "old"], true],
] as const)
  test(`resume ${written.join(",")} ${current.join(",")}`, () => {
    expect(canResume(["old", "old"], [...current], "next", [...written])).toBe(expected);
  });
