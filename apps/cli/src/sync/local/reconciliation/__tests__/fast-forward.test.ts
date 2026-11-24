import { expect, test } from "bun:test";
import { deriveFastForward } from "../fast-forward.ts";

const previous = new Uint8Array([1]);
const server = new Uint8Array([2]);
const mine = new Uint8Array([3]);
const linked = { mode: "link", status: "linked", bytes: previous, base: previous } as const;
const copied = { mode: "copy", status: "linked", bytes: previous, base: previous } as const;

const clean = {
  action: { kind: "write", next: server },
  local: { kind: "content" },
  copies: [linked, copied],
  previous,
  server,
  published: true,
  tombstone: false,
  detached: false,
  repair: false,
  conflicted: false,
};

for (const [changes, expected] of [
  [{}, "pull"],
  [{ copies: [{ ...copied, bytes: mine }] }, "refuse"],
  [{ copies: [linked, { ...copied, bytes: undefined }] }, "refuse"],
  [{ copies: [{ ...linked, status: "missing" }] }, "refuse"],
  [{ copies: [{ ...linked, status: "detached" }] }, "refuse"],
  [{ copies: [] }, "refuse"],
  [{ server: previous, action: { kind: "write", next: previous } }, "refuse"],
  [{ previous: undefined }, "refuse"],
  [{ action: { kind: "write", next: mine } }, "refuse"],
  [{ action: { kind: "choose" } }, "refuse"],
  [{ local: { kind: "conflict" } }, "refuse"],
  [{ published: false }, "refuse"],
  [{ tombstone: true }, "refuse"],
  [{ detached: true }, "refuse"],
  [{ repair: true }, "refuse"],
  [{ conflicted: true }, "refuse"],
] as const)
  test(`auto-pull ${JSON.stringify(changes)}`, () => {
    expect(deriveFastForward({ ...clean, ...changes })).toBe(expected);
  });
