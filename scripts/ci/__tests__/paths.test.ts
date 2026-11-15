import { expect, test } from "bun:test";
import { touchesBinary } from "../paths.ts";

test.each([
  [["apps/web/src/app/styles/docs.css"], false],
  [["docs/PROTOCOL.md", "README.md", ".changeset/fix.md", "LICENSE"], false],
  [["apps/web/package.json", "apps/cli/src/main.ts"], true],
  [["apps/server/src/routes/README.md"], true],
  [[".github/workflows/ci.yml"], true],
  [[], false],
] as [string[], boolean][])("%p needs the binary pipeline: %p", (paths, expected) => {
  expect(touchesBinary(paths)).toBe(expected);
});
