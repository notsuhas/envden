import { test, expect } from "bun:test";
import { unlockPeriod } from "../unlock-period.ts";

test("unlock periods accept only the server policy values", () => {
  expect(["1d", "7d", "30d", "never"].map(unlockPeriod)).toEqual([
    86400000,
    604800000,
    2592000000,
    null,
  ]);

  expect(() => unlockPeriod("forever")).toThrow();
});
