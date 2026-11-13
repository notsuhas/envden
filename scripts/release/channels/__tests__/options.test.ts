import { describe, expect, test } from "bun:test";
import { isMissingFile, parseArguments, publicationAction, repositoryFiles } from "../options.ts";

describe("channel arguments", () => {
  test.each([
    { args: ["1.2.3"], dryRun: false },
    { args: ["0.0.0", "--dry-run"], dryRun: true },
  ])("parses $args", ({ args, dryRun }) => {
    expect(parseArguments(args)).toEqual({ version: args[0], dryRun });
  });

  test.each([
    [],
    ["v1.2.3"],
    ["1.2.3-beta"],
    ["1.2.3", "--push"],
    ["1.2.3", "--dry-run", "--dry-run"],
  ])("rejects invalid arguments %j", (...args) => {
    expect(() => parseArguments(args)).toThrow();
  });
});

test.each([
  { dryRun: true, diff: "file", action: "preview" },
  { dryRun: true, diff: "", action: "preview" },
  { dryRun: false, diff: " \n", action: "unchanged" },
  { dryRun: false, diff: "bucket/envden.json\n", action: "publish" },
])("chooses $action", ({ dryRun, diff, action }) => {
  expect(publicationAction(dryRun, diff)).toBe(action);
});

test.each([
  { readme: undefined, exists: false, files: ["manifest"] },
  { readme: "", exists: false, files: ["manifest", "README.md"] },
  { readme: "install", exists: true, files: ["manifest"] },
  { readme: "install", exists: false, files: ["manifest", "README.md"] },
])("chooses files for $readme, existing $exists", ({ readme, exists, files }) => {
  expect(repositoryFiles("manifest", readme, exists)).toEqual([...files]);
});

test.each([
  { error: Object.assign(new Error("missing"), { code: "ENOENT" }), missing: true },
  { error: Object.assign(new Error("denied"), { code: "EACCES" }), missing: false },
  { error: new Error("unknown"), missing: false },
  { error: { code: "ENOENT" }, missing: false },
  { error: null, missing: false },
])("recognizes missing files: $missing", ({ error, missing }) => {
  expect(isMissingFile(error)).toBe(missing);
});
