import { expect, test } from "bun:test";
import { browserCommand } from "../browser.ts";

test.each([
  ["darwin", ["open", "u"]],
  ["linux", ["xdg-open", "u"]],
] as const)("%s opens with %p", (platform, command) => {
  expect(browserCommand(platform, "u")).toEqual([...command]);
});
