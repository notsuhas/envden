import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { repo } from "./fixture.ts";
import { createGitRepoAdapter } from "../adapter.ts";

test("read-only case detection never creates a filesystem probe", async () => {
  const root = await repo();
  const adapter = createGitRepoAdapter();
  const expected = await adapter.caseInsensitive(root);
  const open = spyOn(fs, "open").mockRejectedValue(new Error("Unexpected filesystem write"));

  try {
    expect(await adapter.caseInsensitive(root, true)).toBe(expected);
    expect(open).not.toHaveBeenCalled();
  } finally {
    open.mockRestore();
  }
});
