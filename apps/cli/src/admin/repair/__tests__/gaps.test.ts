import { test, expect } from "bun:test";
import { deriveGapAction } from "../completion/gaps.ts";

for (const [missing, lost, acceptLost, kind] of [
  [[], [], false, "finish"],
  [[1], [], true, "report"],
  [[], [1], false, "report"],
  [[], [1], true, "finish"],
] as const)
  test(`repair gaps ${missing.length} ${lost.length} ${acceptLost}`, () => {
    expect(deriveGapAction({ missing: [...missing], lost: [...lost] }, acceptLost).kind).toBe(kind);
  });
