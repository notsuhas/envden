import { expect, test } from "bun:test";
import { skipsNotices } from "../quiet-commands.ts";

test("the server, export and machine-readable runs skip the notice check", () => {
  expect(skipsNotices("serve", false)).toBe(true);
  expect(skipsNotices("status", false)).toBe(true);
  expect(skipsNotices("export", false)).toBe(true);
  expect(skipsNotices("push", true)).toBe(true);
  expect(skipsNotices("push", false)).toBe(false);
});
