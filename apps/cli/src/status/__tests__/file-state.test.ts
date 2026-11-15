import { expect, test } from "bun:test";
import { deriveFileState } from "../file-state.ts";

const base = {
  localOnly: false,
  conflict: false,
  placement: "linked" as const,
  heldBack: false,
  changed: false,
  remote: false,
};

for (const [facts, expected] of [
  [{}, "in-sync"],
  [{ placement: "relinkable" }, "in-sync"],
  [{ changed: true }, "changed"],
  [{ remote: true }, "remote"],
  [{ changed: true, remote: true }, "diverged"],
  [{ placement: "missing" }, "missing"],
  [{ placement: "missing", remote: true }, "remote"],
  [{ heldBack: true, changed: true }, "held-back"],
  [{ placement: "detached", heldBack: true }, "detached"],
  [{ conflict: true, heldBack: true, changed: true }, "conflict"],
  [{ localOnly: true, conflict: true }, "local-only"],
] as const)
  test(`file state ${JSON.stringify(facts)} is ${expected}`, () => {
    expect(deriveFileState({ ...base, ...facts })).toBe(expected);
  });
