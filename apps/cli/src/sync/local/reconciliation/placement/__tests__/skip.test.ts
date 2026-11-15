import { expect, test } from "bun:test";
import { targetSkip } from "../skip.ts";

const target = { root: "/a", path: ".env", store: "/store/.env", mode: "link" as const };

test.each([
  ["unlinked target", [], true, undefined],
  ["unchanged link", [target], true, undefined],
  ["unapproved checkout", [target], false, "unapproved"],
  [
    "local only",
    [{ ...target, mode: "copy" as const, localOnly: true as const }],
    true,
    "local-only",
  ],
  ["mode changed", [{ ...target, mode: "copy" as const }], true, "changed"],
  ["store changed", [{ ...target, store: "/store/other" }], true, "changed"],
] as const)("%s", (_, links, approved, expected) => {
  expect(targetSkip(links, target, approved)).toBe(expected);
});
