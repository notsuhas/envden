import { test, expect } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, repo, roots } from "./fixture.ts";
import { createGitRepoAdapter } from "../index.ts";
import { git as hardenedGit } from "../exec/git.ts";

test("git ignores global execution settings while retaining safe directories", async () => {
  const root = await repo();
  const previous = process.env.HOME;
  const home = await mkdtemp(join(tmpdir(), "envden-git-home-"));
  roots.push(home);

  await writeFile(
    join(home, ".gitconfig"),
    `[envden]\n test = global\n[safe]\n directory = ${JSON.stringify(root)}\n`,
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

test("repo IDs follow global and local url rewrites", async () => {
  const root = await repo();
  const previous = process.env.HOME;
  const home = await mkdtemp(join(tmpdir(), "envden-git-home-"));
  roots.push(home);
  const adapter = createGitRepoAdapter({ resolveSshHost: async (host) => host });

  await writeFile(
    join(home, ".gitconfig"),
    `[url "git@github.com:"]\n insteadOf = gh:\n[url "https://host.test/a=b/"]\n insteadOf = eq:\n`,
  );

  git(root, "remote", "set-url", "origin", "gh:Foo/Bar.git");
  git(root, "remote", "add", "upstream", "eq:team/repo");
  process.env.HOME = home;

  try {
    const global = await adapter.checkoutAt(root);
    expect(global?.repoId).toBe("github.com/foo/bar");
    expect(global?.upstreamRepoId).toBe("host.test/a=b/team/repo");

    git(root, "config", "url.https://gitlab.com/.insteadOf", "lab:");
    git(root, "remote", "set-url", "origin", "lab:Group/Repo");
    expect((await adapter.checkoutAt(root))?.repoId).toBe("gitlab.com/group/repo");
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  }
});
