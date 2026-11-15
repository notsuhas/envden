import { expect, test } from "bun:test";
import { restoreGate } from "../gate.ts";
import { restoreRefusal } from "../refusal.ts";
import { parseVersion } from "../version.ts";

for (const [input, expected] of [
  [{ interactive: true, yes: false, agentMerge: false }, "confirm"],
  [{ interactive: true, yes: true, agentMerge: false }, "proceed"],
  [{ interactive: false, yes: true, agentMerge: false }, "refused"],
  [{ interactive: false, yes: false, agentMerge: true }, "refused"],
  [{ interactive: false, yes: true, agentMerge: true }, "proceed"],
] as const)
  test(`restore gate ${JSON.stringify(input)}`, () => {
    expect(restoreGate(input).kind).toBe(expected);
  });

const managed = { managed: true, localOnly: false, detached: false, conflicted: false };

for (const [changes, expected] of [
  [{}, undefined],
  [{ managed: false }, "NOT_FOUND"],
  [{ localOnly: true }, "INVALID_INPUT"],
  [{ detached: true }, "CONFLICT"],
  [{ conflicted: true }, "CONFLICT"],
] as const)
  test(`restore refusal ${JSON.stringify(changes)}`, () => {
    expect(restoreRefusal({ ...managed, ...changes })?.code).toBe(expected);
  });

test("restore versions accept a number or a v prefix", () => {
  expect(parseVersion("3")).toBe(3);
  expect(parseVersion("v12")).toBe(12);

  for (const value of ["0", "-1", "1.5", "x", ""])
    expect(() => parseVersion(value)).toThrow("Version must be a number");
});
