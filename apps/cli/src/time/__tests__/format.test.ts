import { expect, test } from "bun:test";
import { localTime, relativeTime, whenText } from "../format.ts";

const at = Date.UTC(2027, 0, 15, 8, 0);

test.each([
  ["UTC", "2027-01-15 08:00 GMT+0"],
  ["Asia/Kolkata", "2027-01-15 13:30 GMT+5:30"],
  ["America/New_York", "2027-01-15 03:00 GMT-5"],
])("local time in %s reads %s", (zone, expected) => {
  expect(localTime(new Date(at).toISOString(), zone)).toBe(expected);
});

test.each([
  [at + 10 * 60000, "10 minutes ago"],
  [at - 30 * 86400000, "in 1 month"],
  [at + 5000, "5 seconds ago"],
])("relative to %p reads %s", (now, expected) => {
  expect(relativeTime(at, now)).toBe(expected);
});

test("when text pairs relative and local time", () => {
  expect(whenText(at, at + 3600000, "Asia/Kolkata")).toBe("1 hour ago (2027-01-15 13:30 GMT+5:30)");
});
