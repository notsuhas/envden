import { VERSION } from "../../version.ts";
import { test, expect } from "bun:test";
import { deriveUpdateStatus } from "../local.ts";

for (const [latest, unsafe, available, required] of [
  [undefined, [], false, false],
  ["0.0.0", [], false, false],
  ["999.0.0", [VERSION], true, true],
] satisfies [string | undefined, string[], boolean, boolean][])
  test(`update ${latest}`, () => {
    expect(deriveUpdateStatus({ ...(latest ? { latest } : {}), release: { unsafe } })).toEqual({
      available,
      required,
    });
  });
