import { expect, test } from "bun:test";
import { localTime } from "../time.ts";

test.each([
  ["2027-01-15T08:00:00.000Z", "UTC", "2027-01-15 08:00 UTC"],
  ["2027-01-15T08:00:00.000Z", "Asia/Kolkata", "2027-01-15 13:30 GMT+5:30"],
  ["2027-01-15T23:30:00.000Z", "America/New_York", "2027-01-15 18:30 EST"],
  [Date.UTC(2027, 6, 1, 0, 5), "Europe/Berlin", "2027-07-01 02:05 GMT+2"],
] as [string | number, string, string][])("%p in %s reads %s", (utc, zone, expected) => {
  expect(localTime(utc, zone)).toBe(expected);
});
