import { expect, test } from "bun:test";
import { formatBytes, formatUptime, formatWhen } from "../format.ts";

test("formats", () => {
  expect([0, 1023, 1536, 5_243_180, 1073741824].map(formatBytes)).toEqual([
    "0 B",
    "1023 B",
    "1.5 KiB",
    "5 MiB",
    "1 GiB",
  ]);

  expect([59, 3660, 90000, 2775600, 34560060].map(formatUptime)).toEqual([
    "under a minute",
    "1 hour 1 minute",
    "1 day 1 hour",
    "32 days 3 hours",
    "400 days 1 minute",
  ]);

  expect(formatWhen("2027-01-15T08:00:00.000Z", Date.UTC(2027, 0, 15, 8, 12))).toBe(
    "12 minutes ago (2027-01-15 08:00 UTC)",
  );
});
