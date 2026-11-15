import { expect, test } from "bun:test";
import type { TFileStatus } from "../../model.ts";
import { restoreBlock } from "../restore.ts";

test.each([
  ["local-only", true],
  ["conflict", true],
  ["detached", true],
  ["local-changes", false],
] as [TFileStatus, boolean][])("%s blocks restore: %p", (status, blocked) => {
  expect(restoreBlock(status) !== undefined).toBe(blocked);
});
