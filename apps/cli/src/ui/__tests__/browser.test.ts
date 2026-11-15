import { expect, test } from "bun:test";
import { browserCommand } from "../browser.ts";

test.each([
  ["darwin", ["open", "u"]],
  ["linux", ["xdg-open", "u"]],
  ["win32", ["rundll32", "url.dll,FileProtocolHandler", "u"]],
] as const)("%s opens with %p", (platform, command) => {
  expect(browserCommand(platform, "u")).toEqual([...command]);
});
