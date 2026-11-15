import { expect, test } from "bun:test";
import { diffText } from "../diff.ts";

const file = { root: "/repo", path: ".env", differs: true, kind: "diff" as const };

test("diff lists changed keys per file and says when nothing changed", () => {
  expect(diffText([])).toBe("No changes since the last sync");

  expect(diffText([{ ...file, differs: false, added: [], removed: [], changed: [] }])).toBe(
    "No changes since the last sync",
  );

  expect(
    diffText([
      { ...file, added: ["NEW"], removed: ["OLD"], changed: ["TOKEN"] },
      { ...file, path: ".env.local", added: [], removed: [], changed: [] },
      {
        root: "/repo",
        path: ".env.test",
        differs: true,
        kind: "conflict",
        reason: "duplicate-key",
      },
    ]),
  ).toBe(
    [
      "/repo/.env\n  + NEW\n  - OLD\n  ~ TOKEN",
      "/repo/.env.local\n  only comments or formatting changed",
      "/repo/.env.test\n  can't compare keys: duplicate key",
    ].join("\n\n"),
  );
});
