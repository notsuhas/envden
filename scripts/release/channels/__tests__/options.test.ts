import { describe, expect, test } from "bun:test";
import { parseArguments, publicationAction } from "../options.ts";

describe("channel arguments", () => {
  test.each([
    { args: ["1.2.3"], dryRun: false },
    { args: ["0.0.0", "--dry-run"], dryRun: true },
  ])("parses $args", ({ args, dryRun }) => {
    expect(parseArguments(args)).toEqual({ version: args[0], dryRun });
  });

  test.each([[], ["v1.2.3"], ["1.2.3", "--push"], ["1.2.3", "--dry-run", "--dry-run"]])(
    "rejects invalid arguments %j",
    (...args) => {
      expect(() => parseArguments(args)).toThrow();
    },
  );
});

test.each([
  { dryRun: true, diff: "file", action: "preview" },
  { dryRun: false, diff: " \n", action: "unchanged" },
  { dryRun: false, diff: "Formula/envden.rb\n", action: "publish" },
])("chooses $action", ({ dryRun, diff, action }) => {
  expect(publicationAction(dryRun, diff)).toBe(action);
});
