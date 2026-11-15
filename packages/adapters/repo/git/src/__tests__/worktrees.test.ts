import { expect, test } from "bun:test";
import { realpath, rm, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { repo, git } from "./fixture.ts";
import { createGitRepoAdapter } from "../index.ts";
import { worktrees } from "../checkout/worktrees.ts";
import { git as run } from "../exec/git.ts";

const adapter = createGitRepoAdapter({ resolveSshHost: async () => "GitHub.com" });

test("worktrees whose folder is gone are not listed", async () => {
  const root = await repo();
  await writeFile(join(root, "README"), "test");
  git(root, "add", "README");
  git(root, "commit", "-qm", "initial");
  const kept = join(root, "kept");
  const gone = join(root, "gone");
  git(root, "worktree", "add", "-qb", "kept", kept);
  git(root, "worktree", "add", "-qb", "gone", gone);
  await rm(gone, { recursive: true });

  const listed = await adapter.worktrees((await adapter.checkoutAt(root))!);

  expect(listed).toContain(normalize(await realpath(kept)));
  expect(listed.some((path) => path.endsWith("gone"))).toBe(false);
});

// git before 2.36 (Ubuntu 22.04 ships 2.34) rejects worktree list -z
test("worktrees are listed by git that predates worktree list -z", async () => {
  const root = await repo();
  await writeFile(join(root, "README"), "test");
  git(root, "add", "README");
  git(root, "commit", "-qm", "initial");
  const kept = join(root, "kept");
  git(root, "worktree", "add", "-qb", "kept", kept);
  git(root, "worktree", "add", "-qb", "gone", join(root, "gone"));
  await rm(join(root, "gone"), { recursive: true });
  const checkout = (await adapter.checkoutAt(root))!;

  const listed = await worktrees(checkout, (args) =>
    args.includes("-z") ? Promise.reject(new Error("unknown switch `z'")) : run(root, args),
  );

  expect(listed).toEqual([normalize(await realpath(root)), normalize(await realpath(kept))]);
});
