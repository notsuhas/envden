import { expect, test } from "bun:test";
import type { TFileStatus } from "../../model.ts";
import { restoreBlock } from "../restore.ts";

test.each([
  ["local-only", "Local-only files have no history on the server."],
  ["conflict", "Choose a side in Conflicts before restoring."],
  ["detached", "This file is detached; press Pull to reconcile it first."],
  ["local-changes", undefined],
  ["held-back", undefined],
  ["in-sync", undefined],
] as [TFileStatus, string | undefined][])("%s", (status, expected) => {
  expect(restoreBlock(status)).toBe(expected);
});
