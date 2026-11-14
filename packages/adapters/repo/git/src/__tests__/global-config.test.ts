import { test, expect } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repo, roots } from "./fixture.ts";
import { git as hardenedGit } from "../exec/git.ts";

test("git ignores global execution settings while retaining safe directories", async () => {
  const root = await repo();
  const previous = process.env.HOME;
  const home = await mkdtemp(join(tmpdir(), "envden-git-home-"));
  roots.push(home);

  await writeFile(
    join(home, ".gitconfig"),
    `[envden]\n test = global\n[safe]\n directory = ${root}\n`,
  );

  process.env.HOME = home;

  try {
    await rejects(hardenedGit(root, ["config", "--get", "envden.test"]));
    expect((await hardenedGit(root, ["config", "--get-all", "safe.directory"])).trim()).toBe(root);
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  }
});
