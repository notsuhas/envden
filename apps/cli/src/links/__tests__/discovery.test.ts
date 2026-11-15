import { test, expect } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICheckout, IRepoAdapter } from "@envden/core/adapters";
import { discoverRepos } from "../discovery.ts";

function fakeRepo(asked: string[]): IRepoAdapter {
  return {
    checkoutAt: async (path: string): Promise<ICheckout> => {
      asked.push(path);

      return { root: path, gitDir: join(path, ".git"), repoId: path };
    },
    worktrees: async () => [],
  } as unknown as IRepoAdapter;
}

// ~/Work links to another volume, a folder links to its own parent, and one checkout has two names
test("discovery follows linked folders once per real path and keeps the skip list", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "envden-discovery-")));

  try {
    const home = join(root, "home");
    const volume = join(root, "volume", "Work");

    for (const path of [
      join(volume, "app", ".git"),
      join(home, "projects", "api", ".git"),
      join(home, "node_modules", "dep", ".git"),
      join(home, "excluded", "secret", ".git"),
    ])
      await mkdir(path, { recursive: true });

    await symlink(volume, join(home, "Work"));
    await symlink(join(home, "projects"), join(home, "projects", "loop"));
    await symlink(join(home, "projects", "api"), join(home, "api-alias"));
    await symlink(join(home, "node_modules"), join(home, "deps"));
    await symlink(join(home, "excluded"), join(home, "excluded-alias"));

    const asked: string[] = [];

    const found = await discoverRepos(
      fakeRepo(asked),
      [home, join(home, "Work")],
      [join(home, "excluded-alias")],
    );

    expect(found.map((checkout) => checkout.root).sort()).toEqual([
      join(home, "projects", "api"),
      join(volume, "app"),
    ]);

    expect(asked.sort()).toEqual([join(home, "projects", "api"), join(volume, "app")]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovery scans a root reached through a link", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "envden-discovery-root-")));

  try {
    await mkdir(join(root, "volume", "app", ".git"), { recursive: true });
    await symlink(join(root, "volume"), join(root, "Work"));

    const found = await discoverRepos(fakeRepo([]), [join(root, "Work")], []);

    expect(found.map((checkout) => checkout.root)).toEqual([join(root, "volume", "app")]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
