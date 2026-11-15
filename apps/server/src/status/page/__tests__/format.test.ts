import { expect, test } from "bun:test";
import { formatBytes, formatUptime } from "../format.ts";

test("formats", () => {
  expect([0, 1023, 1536, 1073741824].map(formatBytes)).toEqual([
    "0 B",
    "1023 B",
    "1.5 KiB",
    "1.0 GiB",
  ]);

  expect([59, 3660, 90000].map(formatUptime)).toEqual(["0m", "1h 1m", "1d 1h"]);
});
