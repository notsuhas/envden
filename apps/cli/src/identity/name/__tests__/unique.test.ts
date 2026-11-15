import { expect, test } from "bun:test";
import { uniqueDeviceName } from "../unique.ts";

test.each([
  ["laptop", ["desktop"], "laptop"],
  ["laptop", ["laptop"], "laptop-2"],
  ["laptop", ["laptop", "laptop-2"], "laptop-3"],
  ["laptop", ["laptop", "laptop-3"], "laptop-2"],
  ["a".repeat(64), ["a".repeat(64)], `${"a".repeat(62)}-2`],
  ["é".repeat(32), ["é".repeat(32)], `${"é".repeat(31)}-2`],
])("%p among %p becomes %p", (name, taken, expected) => {
  expect(uniqueDeviceName(name, taken)).toBe(expected);
});
