import { expect, test } from "bun:test";
import { unlockText } from "../text.ts";

const now = 1800000000000;
const day = 86400000;
const date = (ms: number) => `<${ms - now}>`;

test("a future expiry shows its date and how far away it is", () => {
  expect(unlockText({ kind: "until", until: now + 23 * day + 300000 }, now, date)).toBe(
    `<${23 * day + 300000}> (in 23 days)`,
  );
});

test("an expiry that has passed reads as locked", () => {
  expect(unlockText({ kind: "until", until: now }, now, date)).toBe(
    unlockText({ kind: "locked" }, now, date),
  );
});
