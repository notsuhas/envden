import { test, expect } from "bun:test";
import {
  deriveContentAction,
  deriveDefaultContent,
  deriveStoreSource,
  deriveUntrackedConflict,
} from "../decision.ts";

const mine = new Uint8Array([1]);
const server = new Uint8Array([2]);
const previous = new Uint8Array([3]);

const input = {
  linked: true,
  useStore: true,
  mine,
  server,
  previous,
  choosing: false,
  repair: false,
};

for (const [changes, expected] of [
  [{}, "choose"],
  [{ previous: server }, "write"],
  [{ previous: mine }, "write"],
  [{ mine: server }, "write"],
  [{ linked: false, useStore: false }, "conflict"],
  [{ linked: false, useStore: false, choosing: true }, "choose"],
  [{ repair: true }, "repair-conflict"],
  [{ repair: true, mine: undefined }, "choose"],
] as const)
  test(`content decision ${JSON.stringify(changes)}`, () => {
    expect(deriveContentAction({ ...input, ...changes }).kind).toBe(expected);
  });

test("unchanged server preserves a local edit or deletion", () => {
  expect(deriveDefaultContent({ ...input, previous: server })).toBe(mine);
  expect(deriveDefaultContent({ ...input, previous: server, mine: undefined })).toBeUndefined();
  expect(deriveDefaultContent(input)).toBe(server);

  expect(deriveUntrackedConflict({ ...input, linked: false, useStore: false }).kind).toBe(
    "conflict",
  );
});

for (const [mode, status, linked, expected] of [
  ["link", "missing", false, true],
  ["link", "linked", true, true],
  ["link", "detached", true, false],
  ["copy", "missing", true, false],
  ["link", "relinkable", false, false],
] as const)
  test(`store source ${mode} ${status} ${linked}`, () => {
    expect(deriveStoreSource(mode, status, linked)).toBe(expected);
  });
