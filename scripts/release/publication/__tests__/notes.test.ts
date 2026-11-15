import { expect, test } from "bun:test";
import { releaseNotes } from "../notes.ts";

const changelog = `# @envden/cli

## 1.2.3

### Patch Changes

- abc1234: Fixed a thing.
- def5678: Added another
  thing over two lines.
- @envden/server@1.2.3

## 1.2.2

### Patch Changes

- 9999999: Older entry.
`;

test("release notes hold that version's entries, linked to commits, and nothing older", () => {
  const notes = releaseNotes(changelog, "1.2.3", "test/envden");

  expect(notes).toStartWith(
    "### Patch Changes\n\n- Fixed a thing. ([abc1234](https://github.com/test/envden/commit/abc1234))",
  );

  expect(notes).toContain(
    "- Added another ([def5678](https://github.com/test/envden/commit/def5678))\n  thing over two lines.",
  );

  expect(notes).not.toContain("@envden/server");
  expect(notes).not.toContain("Older entry");
  expect(notes).toContain("brew upgrade envden");
  expect(notes).toContain("https://github.com/test/envden/blob/v1.2.3/apps/cli/CHANGELOG.md");
});

test("a version without a changelog section stops the release", () => {
  expect(() => releaseNotes(changelog, "9.9.9", "test/envden")).toThrow("no section for 9.9.9");
});
