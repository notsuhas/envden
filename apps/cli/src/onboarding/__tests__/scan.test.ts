import { test, expect } from "bun:test";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { emptyState } from "../../state/model.ts";
import { atomicWrite } from "../../state/files.ts";
import { setupCheckouts } from "../scan.ts";

test("differing worktree env files do not abort unrelated linking", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-scan-conflict-"));

  try {
    const adapters = createAdapters({
      home: join(root, "home"),
      userHome: root,
      keychain: createMemoryKeychainAdapter([]),
    });

    const repos = ["main", "worktree", "unrelated", "empty"].map((name) => ({
      root: join(root, name),
      gitDir: join(root, name, ".git"),
      repoId: name === "worktree" ? "host/main" : `host/${name}`,
    }));

    for (const [index, repo] of repos.entries()) {
      await mkdir(repo.gitDir, { recursive: true });
      if (index < 3) await atomicWrite(join(repo.root, ".env"), `PORT=${index + 1}`);
    }

    adapters.repo.checkoutAt = async (path) => repos.find((repo) => repo.root === path);
    adapters.repo.worktrees = async () => [];
    adapters.repo.envFiles = async (repo) => (repo.repoId === "host/empty" ? [] : [".env"]);
    adapters.repo.ensureIgnored = async () => {};
    const approved: string[] = [];
    const state = emptyState("test");

    await setupCheckouts(adapters, state, {
      scanRoot: [root],
      approve: async (repo) => {
        approved.push(repo.repoId);

        return true;
      },
      now: () => 100,
    });

    expect(state.links).toHaveLength(2);
    expect(state.links.some((link) => link.root.endsWith("unrelated"))).toBe(true);
    expect(approved).not.toContain("host/empty");
    expect(await readFile(join(repos[1]!.root, ".env"), "utf8")).toBe("PORT=2");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
