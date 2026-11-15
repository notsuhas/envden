import { expect, test } from "bun:test";
import { deriveFileSides } from "../content/sides.ts";
import { scenarios } from "./sides/scenarios.ts";
import { cases } from "./sides/cases.ts";
import { reference, type TScenario, type TValue } from "./sides/reference.ts";

const bytes = (value: TValue) => (value === null ? undefined : new TextEncoder().encode(value));

function derive(input: TScenario) {
  return deriveFileSides({
    storeBeforeRestore: bytes(input.store),
    recorded: bytes(input.recorded),
    previous: bytes(input.previous),
    server:
      input.server === "absent" || input.server === "tombstone"
        ? { kind: input.server }
        : { kind: "live", bytes: bytes(input.server)! },
    pendingRemoval: input.pending,
    copies: [
      {
        bytes: bytes(input.copy),
        base: bytes(input.base),
        tracked: true,
        detached: false,
        mode: "copy",
        historical: input.base === null && input.copy !== null && input.copy === input.previous,
      },
    ],
  });
}

for (const [why, store, recorded, previous, server, copy, base, pending, mine] of cases)
  test(why, () => {
    if (pending && store !== null) throw new Error("Unreachable removal");

    const input: TScenario = pending
      ? { store: null, recorded, previous, server, copy, base, pending: true }
      : { store, recorded, previous, server, copy, base, pending: false };

    expect(derive(input).mine).toEqual(bytes(mine));
    expect(reference(input)).toBe(mine);
  });

test("reachable copy states agree with DESIGN and retain local edits", () => {
  let count = 0;

  for (const input of scenarios()) {
    verify(input);
    count++;
  }

  expect(count).toBe(6400);
});

function verify(input: TScenario) {
  const { server, pending } = input;
  const result = derive(input);
  const expected = reference(input);
  expect({ input, mine: result.mine }).toEqual({ input, mine: bytes(expected) });

  expect(result.theirs).toEqual(
    server === "absent" || server === "tombstone"
      ? { kind: server }
      : { kind: "live", bytes: bytes(server)! },
  );

  if (pending && server !== "tombstone") expect(result.mine).toBeUndefined();

  verifyRetained(input, result);
  verifyDistinct(input, result);
}

function verifyRetained(input: TScenario, result: ReturnType<typeof derive>) {
  const { previous, server, copy, base } = input;
  const saved = [result.mine, ...(result.local.kind === "conflict" ? result.local.variants : [])];

  const edits = [unsettledStore(input), copy !== null && copy !== (base ?? previous) ? copy : null];

  for (const edit of edits)
    if (edit !== null && edit !== server)
      expect({
        input,
        retained: saved.some((value) => new TextDecoder().decode(value) === edit),
      }).toEqual({ input, retained: true });
}

function verifyDistinct(input: TScenario, result: ReturnType<typeof derive>) {
  if (result.local.kind !== "conflict") return;
  const theirs = result.theirs.kind === "live" ? result.theirs.bytes : undefined;

  if (result.theirs.kind === "absent") return;

  expect({ input, same: result.mine === theirs || equalBytes(result.mine, theirs) }).toEqual({
    input,
    same: false,
  });
}

function equalBytes(left: Uint8Array | undefined, right: Uint8Array | undefined) {
  return left !== undefined && right !== undefined && Buffer.from(left).equals(right);
}

function unsettledStore(input: TScenario) {
  const { store, copy, base, recorded, previous } = input;

  if (store === null) return null;
  if (base === store && copy !== null && copy !== base) return null;

  return store !== (recorded ?? previous) || store !== previous ? store : null;
}

test("a changed store stays mine regardless of target order", () => {
  const copies = [
    { bytes: bytes("B"), base: bytes("A"), tracked: true, mode: "copy" as const, detached: false },
    { bytes: bytes("C"), base: undefined, tracked: true, mode: "copy" as const, detached: false },
  ];

  for (const targets of [copies, copies.toReversed()])
    expect(
      deriveFileSides({
        storeBeforeRestore: bytes("A"),
        recorded: undefined,
        previous: undefined,
        server: { kind: "absent" },
        pendingRemoval: false,
        copies: targets,
      }).mine,
    ).toEqual(bytes("A"));
});
