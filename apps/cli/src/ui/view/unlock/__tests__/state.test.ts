import { expect, test } from "bun:test";
import { deriveUnlock, type TUnlockProbe } from "../state.ts";

const now = 1800000000000;
const later = now + 1000;
const earlier = now - 1000;
const unlocked: TUnlockProbe = { kind: "unlocked", period: 2592000000 };
const forever: TUnlockProbe = { kind: "unlocked", period: null };
const locked: TUnlockProbe = { kind: "locked" };
const unreachable: TUnlockProbe = { kind: "unreachable" };

test.each([
  ["server says locked", later, locked, { kind: "locked" }],
  ["server says never", undefined, forever, { kind: "never" }],
  ["unlocked with a recorded expiry", later, unlocked, { kind: "until", until: later }],
  ["unlocked past the recorded expiry", earlier, unlocked, { kind: "unrecorded" }],
  ["unlocked with nothing recorded", undefined, unlocked, { kind: "unrecorded" }],
  ["unlocked after a never period ended", null, unlocked, { kind: "unrecorded" }],
  ["offline with a future expiry", later, unreachable, { kind: "until", until: later }],
  ["offline past the expiry", earlier, unreachable, { kind: "locked" }],
  ["offline with never recorded", null, unreachable, { kind: "never" }],
  ["offline with nothing recorded", undefined, unreachable, { kind: "unknown" }],
] as const)("%s", (_name, recorded, probe, expected) => {
  expect(deriveUnlock(recorded, probe, now)).toEqual(expected);
});
