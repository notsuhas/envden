import { test, expect } from "bun:test";
import { mailboxSide } from "../side.ts";

test.each([
  [true, true, "KE2", "allowed"],
  [false, true, "KE2", "denied"],
  [true, true, "KE1", "denied"],
  [false, true, "KE1", "allowed"],
  [true, false, "KE1", "allowed"],
  [false, false, "KE1", "denied"],
  [true, false, "KE2", "allowed"],
  [false, false, "KE2", "allowed"],
] as const)("mailbox side %s %s %s", (owner, write, slot, kind) => {
  expect(mailboxSide(owner, write, slot)).toEqual({ kind });
});
