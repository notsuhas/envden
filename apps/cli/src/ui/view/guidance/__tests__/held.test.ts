import { expect, test } from "bun:test";
import type { THeldBack } from "../../../../sync/local/lineage/reasons.ts";
import { heldGuidance } from "../held.ts";

test.each([
  ["invalid-state", "invalid sync state; press Pull, then settle any conflict above"],
  ["oversized", "file exceeds 1 MiB; reduce its size before pushing"],
  ["needs-approval", "checkout needs approval; run envden track in a terminal"],
  ["excluded", "excluded by env-files; change them with envden config in a terminal"],
  ["conflict", "choose a side in Conflicts"],
  ["lost", "content was lost outside envden; restore a version from History"],
  ["incomplete", "placement incomplete; press Pull"],
] as [THeldBack, string][])("%s", (held, expected) => {
  expect(heldGuidance(held)).toBe(expected);
});
