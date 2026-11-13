import { test, expect } from "bun:test";
import { deriveUpdateStatus } from "../local.ts";

for (const [latest, unsafe, available, required] of [
  [undefined, [], false, false],
  ["0.0.0", [], false, false],
  ["1.0.0", ["0.0.0"], true, true],
] satisfies [string | undefined, string[], boolean, boolean][])
  test(`update ${latest}`, () => {
    expect(deriveUpdateStatus({ ...(latest ? { latest } : {}), release: { unsafe } })).toEqual({
      available,
      required,
    });
  });
