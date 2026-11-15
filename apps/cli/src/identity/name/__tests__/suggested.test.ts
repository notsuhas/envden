import { expect, test } from "bun:test";
import { suggestedDeviceName } from "../suggested.ts";

test.each([
  ["Suhas-MacBook-Pro.local", "Suhas-MacBook-Pro"],
  ["build-box.lan", "build-box"],
  ["ci-runner.example.com", "ci-runner"],
  ["  padded  ", "padded"],
  ["lap\u0007top​", "laptop"],
  ["", "device"],
  [".local", "device"],
  ["‎", "device"],
  ["a".repeat(70), "a".repeat(64)],
  ["é".repeat(40), "é".repeat(32)],
  [`${"a".repeat(62)}😀`, "a".repeat(62)],
])("%p suggests %p", (hostname, expected) => {
  expect(suggestedDeviceName(hostname)).toBe(expected);
});
