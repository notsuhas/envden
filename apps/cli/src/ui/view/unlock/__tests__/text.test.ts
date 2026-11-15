import { expect, test } from "bun:test";
import type { TUnlock } from "../../model.ts";
import { unlockText } from "../text.ts";

const now = 1800000000000;
const minute = 60000;
const day = 24 * 60 * minute;
const date = (ms: number) => `<${ms - now}>`;

test.each([
  [
    { kind: "until", until: now + 23 * day + 5 * minute },
    `<${23 * day + 5 * minute}> (in 23 days)`,
  ],
  [{ kind: "until", until: now + day }, `<${day}> (in 1 day)`],
  [{ kind: "until", until: now + 5 * 60 * minute }, `<${5 * 60 * minute}> (in 5 hours)`],
  [{ kind: "until", until: now + 80 * 1000 }, "<80000> (in 1 minute)"],
  [{ kind: "until", until: now + 1000 }, "<1000> (in under a minute)"],
  [{ kind: "until", until: now }, "locked — run envden unlock in a terminal"],
  [{ kind: "never" }, "never expires"],
  [{ kind: "locked" }, "locked — run envden unlock in a terminal"],
  [{ kind: "unrecorded" }, "unlocked; expiry not recorded on this device"],
  [{ kind: "unknown" }, "unknown; the server is unreachable"],
] as [TUnlock, string][])("%j reads %s", (unlock, expected) => {
  expect(unlockText(unlock, now, date)).toBe(expected);
});
