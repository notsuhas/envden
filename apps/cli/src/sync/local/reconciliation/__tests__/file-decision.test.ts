import { expect, test } from "bun:test";
import { deriveFileDecision } from "../file-decision.ts";
import { derivePlaceVersion } from "../../lineage/versions.ts";

const A = new Uint8Array([1]);
const B = new Uint8Array([2]);
const C = new Uint8Array([3]);
const common = { copies: [], tracked: true, published: true, choosing: false, repair: false };

for (const [name, store, previous, server, next] of [
  ["unchanged current", A, A, A, A],
  ["unchanged stale", A, A, B, B],
  ["attempt acknowledged", B, B, B, B],
  ["attempt superseded", B, B, A, A],
  ["attempt rejected", B, A, A, B],
  ["pending completed", B, B, B, B],
  ["pending superseded", B, B, A, A],
  ["new edit", C, A, A, C],
  ["deliberate revert", A, B, B, A],
  ["identical concurrent edit", B, A, B, B],
] as const)
  test(name, () => {
    expect(deriveFileDecision({ ...common, store, previous, server })).toEqual({
      local: { kind: "content", bytes: store },
      mine: store,
      action: { kind: "write", next },
    });
  });

for (const [name, store, previous, server] of [
  ["divergent new edit", C, A, B],
  ["divergent deliberate revert", A, B, C],
  ["rejected attempt with concurrent edit", B, A, C],
] as const)
  test(name, () => {
    expect(deriveFileDecision({ ...common, store, previous, server }).action).toEqual({
      kind: "choose",
    });
  });

for (const [name, bytes, base, tracked, mode, expected] of [
  ["copy unchanged follows store", A, A, true, "copy", { kind: "content", bytes: B }],
  [
    "copy edit conflicts with synced store",
    C,
    A,
    true,
    "copy",
    { kind: "conflict", mine: C, theirs: B },
  ],
  ["untracked bytes conflict", C, A, false, "copy", { kind: "conflict", mine: C, theirs: B }],
  ["unbased bytes conflict", C, undefined, true, "copy", { kind: "conflict", mine: C, theirs: B }],
  ["detached bytes conflict", C, A, true, "link", { kind: "conflict", mine: B, theirs: C }],
  ["tracked detached revert is an edit", A, B, true, "link", { kind: "content", bytes: A }],
  ["tracked detached new bytes are an edit", C, B, true, "link", { kind: "content", bytes: C }],
  ["matching detached bytes relink", B, A, true, "link", { kind: "content", bytes: B }],
  [
    "untracked detached bytes require a choice",
    A,
    B,
    false,
    "link",
    { kind: "conflict", mine: A, theirs: B },
  ],
  ["missing copy restores", undefined, A, true, "copy", { kind: "content", bytes: B }],
] as const)
  test(name, () => {
    expect(
      deriveFileDecision({
        ...common,
        store: B,
        previous: A,
        recorded: B,
        server: B,
        copies: [{ bytes, base, tracked, mode, detached: false }],
      }).local,
    ).toEqual(expected);
  });

for (const [current, base, accepted, expected] of [
  ["a", "a", true, "unchanged"],
  ["b", "a", true, "edited"],
  ["a", "b", true, "edited"],
  ["b", "b", false, "unaccepted"],
  [null, null, true, "unchanged"],
  [null, "a", true, "edited"],
] as const)
  test(`place ${current}/${base}/${accepted}`, () => {
    expect(derivePlaceVersion(current, base, accepted)).toBe(expected);
  });

for (const [name, store, recorded, previous, server, deleting, mine, theirs] of [
  ["store edit is mine", B, A, A, A, false, B, C],
  ["pending removal is mine", undefined, A, A, A, true, undefined, C],
  ["synced store leaves copy edit as mine", B, B, B, B, false, C, B],
] as const)
  test(name, () => {
    expect(
      deriveFileDecision({
        ...common,
        store,
        recorded,
        previous,
        server,
        deleting,
        copies: [{ bytes: C, base: A, tracked: true, mode: "copy", detached: false }],
      }).local,
    ).toEqual({ kind: "conflict", mine, theirs });
  });

test("copy already at server does not conflict with unchanged stale store", () => {
  expect(
    deriveFileDecision({
      ...common,
      store: A,
      recorded: A,
      previous: A,
      server: B,
      copies: [{ bytes: B, base: C, tracked: true, mode: "copy", detached: false }],
    }).action,
  ).toEqual({ kind: "write", next: B });
});
