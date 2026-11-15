import { expect, test } from "bun:test";
import { diffText } from "../diff.ts";

const file = { root: "/repo", path: ".env", differs: true, kind: "diff" as const };

test("diff lists changed keys per file and says when nothing changed", () => {
  expect(diffText([{ ...file, differs: false, added: [], removed: [], changed: [] }])).toBe(
    diffText([]),
  );

  const [keys, formatting, conflict] = diffText([
    { ...file, added: ["NEW"], removed: ["OLD"], changed: ["TOKEN"] },
    { ...file, path: ".env.local", added: [], removed: [], changed: [] },
    { root: "/repo", path: ".env.test", differs: true, kind: "conflict", reason: "duplicate-key" },
  ]).split("\n\n");

  expect(keys).toBe("/repo/.env\n  + NEW\n  - OLD\n  ~ TOKEN");
  expect(formatting).toStartWith("/repo/.env.local\n");
  expect(formatting).toContain("formatting");
  expect(conflict).toStartWith("/repo/.env.test\n");
  expect(conflict).toContain("duplicate key");
});
