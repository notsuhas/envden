import { expect, test } from "bun:test";
import { restoreKind } from "../start.ts";

const vault = { active: true, frozen: false, proofRefused: false };

test.each([
  [vault, "repair"],
  [{ ...vault, frozen: true }, "repair"],
  [{ ...vault, active: false }, "moving"],
  [{ ...vault, frozen: true, serverMoved: new Uint8Array(32) }, "moved"],
] as const)("restoreKind %#", (input, expected) => {
  expect(restoreKind(input)).toBe(expected);
});
